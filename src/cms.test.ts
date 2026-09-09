import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPublishedPage, publicMedia } from "./cms";
const component = (code: string, index: number) => ({
  code,
  index,
  renderer: "circa.centres",
  rendererContractVersion: 1,
  properties: { title: code },
});
function delivery(components: unknown[]) {
  return {
    result: {
      contractVersion: 0,
      site: "circaSite",
      path: "/",
      page: { code: "home", renderer: "circa.page", components },
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
describe("published Circa page boundary", () => {
  it("uses the published section ordering without forwarding customer credentials", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () =>
          delivery([component("later", 20), component("first", 10)]),
      });
    vi.stubGlobal("fetch", fetcher);
    expect(
      (await loadPublishedPage("/")).sections.map((section) => section.code),
    ).toEqual(["first", "later"]);
    expect(fetcher.mock.calls[0][1].credentials).toBe("omit");
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(fetcher.mock.calls[0][0]).toContain(
      "/nodics/cms/v0/delivery/pages/resolve?",
    );
  });
  it("rejects incompatible component contracts and does not substitute unpublished content", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () =>
            delivery([
              { ...component("unknown", 0), renderer: "arbitrary.script" },
            ]),
        }),
    );
    await expect(loadPublishedPage("/")).rejects.toThrow(
      "unsupported component",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );
    await expect(loadPublishedPage("/")).rejects.toThrow(
      "temporarily unavailable",
    );
  });
  it("allows only media identities at the public Media delivery boundary", () => {
    expect(publicMedia("circa-hero")).toBe(
      "/nodics/media/v0/content/circa-hero",
    );
    expect(publicMedia("https://untrusted.invalid/image")).toBe("");
    expect(publicMedia("../private")).toBe("");
  });
});
