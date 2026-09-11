import { publishedArtwork } from "./cms";
import { useEffect, useState } from "react";
import { API, request, type Session } from "./api";
/** Resolves original evidence through the owning resource's authorization check. */
export function PrivatePhoto({
  record,
  kind,
  session,
  alt,
  className,
}: {
  record: {
    code: string;
    metadata: { photo?: { code?: string; url?: string } };
  };
  kind: "assets" | "submissions";
  session: Session;
  alt: string;
  className?: string;
}) {
  const [src, setSrc] = useState(
      record.metadata.photo?.code
        ? ""
        : publishedArtwork(record.metadata.photo?.url || ""),
    ),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setSrc(
      record.metadata.photo?.code
        ? ""
        : publishedArtwork(record.metadata.photo?.url || ""),
    );
    setFailed(false);
    if (record.metadata.photo?.code)
      void request<{ url?: string; mimeType?: string; contentBase64?: string }>(
        `${API}/${kind}/${encodeURIComponent(record.code)}/photo`,
        session,
      )
        .then((photo) => {
          if (!active) return;
          if (
            photo.contentBase64 &&
            /^image\/(jpeg|png|webp|svg\+xml)$/.test(photo.mimeType || "")
          )
            setSrc(`data:${photo.mimeType};base64,${photo.contentBase64}`);
          else if (photo.url) setSrc(publishedArtwork(photo.url));
          else setFailed(true);
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    return () => {
      active = false;
    };
  }, [
    record.code,
    record.metadata.photo?.code,
    record.metadata.photo?.url,
    kind,
    session.token,
  ]);
  return (
    <>
      {src && !failed ? (
        <img
          className={className}
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className={`private-photo-status ${className || ""}`}
          role="status"
        >
          {failed
            ? "Original photo could not be loaded."
            : record.metadata.photo?.code
              ? "Loading item photo…"
              : "No item photo available."}
        </div>
      )}
    </>
  );
}
