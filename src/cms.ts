/** Circa's typed rendering boundary for the canonical CMS Online page contract. */
import { useEffect, useState } from "react";

export type Content = Record<string, unknown>;
export type Section = {
  code: string;
  renderer: string;
  properties: Content;
  index: number;
};
export type PublishedPage = { code: string; sections: Section[] };
const renderers = new Set(
  [
    "shell",
    "hero",
    "wallet",
    "solution",
    "offers",
    "centres",
    "contact",
    "policy",
    "wasteWorkspace",
  ].map((name) => `circa.${name}`),
);
export function contentText(content: Content | undefined, key: string): string {
  return typeof content?.[key] === "string" ? (content[key] as string) : "";
}
export function contentItems(
  content: Content | undefined,
  key: string,
): Content[] {
  const values = content?.[key];
  return Array.isArray(values)
    ? values.filter(
        (v): v is Content => !!v && typeof v === "object" && !Array.isArray(v),
      )
    : [];
}
export function contentStrings(
  content: Content | undefined,
  key: string,
): string[] {
  const values = content?.[key];
  return Array.isArray(values)
    ? values.filter((v): v is string => typeof v === "string")
    : [];
}
export function publicMedia(code: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/.test(code)) return "";
  return `/nodics/media/v0/content/${encodeURIComponent(code)}`;
}
/** Reads only public CMS Online content; no customer credentials or transaction state are sent. */
export async function loadPublishedPage(
  path: string,
  signal?: AbortSignal,
): Promise<PublishedPage> {
  const query = new URLSearchParams({
    site: "circaSite",
    path,
    locale: "en",
    channel: "web",
    contractVersion: "0",
  });
  const response = await fetch(
    `/nodics/cms/v0/delivery/pages/resolve?${query}`,
    {
      headers: { Accept: "application/json", "x-enterprise-code": "default" },
      credentials: "omit",
      cache: "no-store",
      signal,
    },
  );
  if (!response.ok)
    throw new Error("Published website content is temporarily unavailable.");
  const envelope = await response.json();
  const data = envelope.result;
  if (
    !data ||
    data.contractVersion !== 0 ||
    data.site !== "circaSite" ||
    data.path !== path ||
    data.page?.renderer !== "circa.page" ||
    !Array.isArray(data.page.components) ||
    data.page.components.length > 24
  )
    throw new Error("Published website content has an incompatible contract.");
  const sections: Section[] = data.page.components
    .filter((item: Content) => item.active !== false)
    .map((item: Content) => {
      if (
        typeof item.code !== "string" ||
        typeof item.renderer !== "string" ||
        !renderers.has(item.renderer) ||
        item.rendererContractVersion !== 1 ||
        !item.properties ||
        typeof item.properties !== "object" ||
        Array.isArray(item.properties)
      )
        throw new Error("Published page contains an unsupported component.");
      return {
        code: item.code,
        renderer: item.renderer,
        properties: item.properties as Content,
        index: Number(item.index) || 0,
      };
    });
  return {
    code: data.page.code,
    sections: sections.sort((a, b) => a.index - b.index),
  };
}
export function usePublishedPage(path: string, revision: number) {
  const [page, setPage] = useState<PublishedPage | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setPage(null);
    setError("");
    loadPublishedPage(path, controller.signal)
      .then(setPage)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [path, revision]);
  return { page, error };
}

/** Resolves legacy sample artwork paths to the same published Media identities. */
export function publishedArtwork(value: string): string {
  const match =
    /^\/media\/((?:circa-|asset-|coupon-)[a-z0-9-]+)\.(?:svg|png|jpg|webp)$/.exec(
      value,
    );
  if (!match) return value;
  return publicMedia(
    match[1].startsWith("circa-") ? match[1] : "circa-" + match[1],
  );
}
