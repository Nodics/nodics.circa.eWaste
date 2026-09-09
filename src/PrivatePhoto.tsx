import { publishedArtwork } from "./cms";
import { useEffect, useState } from "react";
import {
  API,
  photoOf,
  request,
  type Asset,
  type Submission,
  type Session,
} from "./api";
/** Resolves original evidence through the owning resource's authorization check. */
export function PrivatePhoto({
  record,
  kind,
  session,
  alt,
  className,
}: {
  record: Asset | Submission;
  kind: "assets" | "submissions";
  session: Session;
  alt: string;
  className?: string;
}) {
  const [src, setSrc] = useState(publishedArtwork(photoOf(record))),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setSrc(publishedArtwork(photoOf(record)));
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
            /^image\/(jpeg|png|webp)$/.test(photo.mimeType || "")
          )
            setSrc(`data:${photo.mimeType};base64,${photo.contentBase64}`);
          else if (photo.url) setSrc(publishedArtwork(photo.url));
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    return () => {
      active = false;
    };
  }, [record.code, record.metadata.photo?.code, kind, session]);
  return (
    <>
      <img className={className} src={src} alt={alt} loading="lazy" />
      {failed && <small>Original photo could not be loaded.</small>}
    </>
  );
}
