import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { request } from "./api";
import { PrivatePhoto } from "./PrivatePhoto";

vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  request: vi.fn(),
}));
const session = { loginId: "customer@example.test", token: "test-token" };
const record = {
  code: "owned-item",
  metadata: { photo: { code: "saved-media", url: "/media/asset-laptop.svg" } },
};
beforeEach(() => {
  vi.mocked(request).mockReset();
});
afterEach(cleanup);

it.each(["image/svg+xml", "image/png", "image/jpeg", "image/webp"])(
  "renders authorized %s evidence as an image",
  async (mimeType) => {
    vi.mocked(request).mockResolvedValue({ mimeType, contentBase64: "YWJj" });
    render(<PrivatePhoto record={record} kind="assets" session={session} alt="My item" />);
    expect(await screen.findByRole("img", { name: "My item" })).toHaveAttribute(
      "src", `data:${mimeType};base64,YWJj`,
    );
    expect(request).toHaveBeenCalledWith("/nodics/eWaste/v0/assets/owned-item/photo", session);
    expect(document.querySelector("svg, object, iframe")).toBeNull();
  },
);

it("keeps unsupported content out of the image renderer", async () => {
  vi.mocked(request).mockResolvedValue({ mimeType: "text/html", contentBase64: "YWJj" });
  render(<PrivatePhoto record={record} kind="submissions" session={session} alt="My item" />);
  await screen.findByText("Original photo could not be loaded.");
  expect(screen.queryByRole("img")).toBeNull();
});

it("does not fall back to a public URL when private evidence access fails", async () => {
  vi.mocked(request).mockRejectedValue(new Error("Not authorized"));
  render(<PrivatePhoto record={record} kind="assets" session={session} alt="My item" />);
  await screen.findByText("Original photo could not be loaded.");
  expect(screen.queryByRole("img")).toBeNull();
});
