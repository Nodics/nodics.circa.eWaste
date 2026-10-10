/** Isolated proxy regression: published delivery and private operations retain distinct runtimes. */
import { loadEnv } from "vite";
import { expect, it, vi } from "vitest";
import configure from "../vite.config";

vi.mock("vite", () => ({
  defineConfig: <T,>(configuration: T) => configuration,
  loadEnv: vi.fn(),
}));
vi.mock("@vitejs/plugin-react", () => ({
  default: () => ({ name: "react-fixture" }),
}));

/** Evaluates the real configuration without reading deployment environment files or starting Vite. */
async function proxies(environment: Record<string, string> = {}) {
  vi.mocked(loadEnv).mockReturnValue(environment);
  if (typeof configure !== "function")
    throw new Error("Expected Vite configuration factory");
  const config = await configure({ command: "serve", mode: "test" });
  return config.server?.proxy || {};
}

/** Resolves these literal prefixes in Vite's first-match order without opening a proxy connection. */
function firstMatch(proxy: Awaited<ReturnType<typeof proxies>>, path: string) {
  return Object.entries(proxy).find(([prefix]) => path.startsWith(prefix))?.[1];
}

it("delivers public content from Online and keeps uploads, downloads and private photos on their owners", async () => {
  const proxy = await proxies();
  for (const path of [
    "/nodics/cms/v0/delivery/pages/resolve",
    "/nodics/media/v0/content/circa-hero",
  ])
    expect(firstMatch(proxy, path)).toMatchObject({
      target: "http://127.0.0.1:4314", changeOrigin: true,
    });
  for (const path of [
    "/nodics/media/v0/storage/upload",
    "/nodics/media/v0/download/photo",
    "/nodics/media/v0/customer/photos/photo",
  ])
    expect(firstMatch(proxy, path)).toMatchObject({
      target: "http://127.0.0.1:4312", changeOrigin: true,
    });
  for (const path of [
    "/nodics/eWaste/v0/assets/item/photo",
    "/nodics/eWaste/v0/submissions/item/photo",
    "/nodics/eWaste/v0/submissions/prepare",
  ])
    expect(firstMatch(proxy, path)).toMatchObject({
      target: "http://127.0.0.1:4370", changeOrigin: true,
    });
});

it("matches public content before general Media and both before the domain fallback", async () => {
  const prefixes = Object.keys(await proxies());
  const publicIndex = prefixes.indexOf("/nodics/media/v0/content");
  const privateIndex = prefixes.indexOf("/nodics/media");
  const fallbackIndex = prefixes.indexOf("/nodics");
  expect(publicIndex).toBeGreaterThanOrEqual(0);
  expect(publicIndex).toBeLessThan(privateIndex);
  expect(privateIndex).toBeLessThan(fallbackIndex);
});

const deploymentOverrides: Record<string, string>[] = [
  { VITE_CIRCA_WCMS_ONLINE_TARGET: "http://online.example.test:8014" },
  { VITE_CIRCA_MEDIA_TARGET: "http://staged.example.test:8012" },
  {
    VITE_CIRCA_WCMS_ONLINE_TARGET: "http://online.example.test:8014",
    VITE_CIRCA_MEDIA_TARGET: "http://staged.example.test:8012",
    VITE_CIRCA_BACKEND_PROXY_TARGET: "http://waste.example.test:8070",
  },
];

it.each(deploymentOverrides)("preserves independent deployment overrides: %j", async (environment) => {
  const proxy = await proxies(environment);
  expect(firstMatch(proxy, "/nodics/media/v0/content/circa-hero")).toMatchObject({
    target: environment.VITE_CIRCA_WCMS_ONLINE_TARGET ?? "http://127.0.0.1:4314",
  });
  expect(firstMatch(proxy, "/nodics/cms/v0/delivery/pages/resolve")).toMatchObject({
    target: environment.VITE_CIRCA_WCMS_ONLINE_TARGET ?? "http://127.0.0.1:4314",
  });
  for (const path of [
    "/nodics/media/v0/storage/upload",
    "/nodics/media/v0/download/photo",
  ])
    expect(firstMatch(proxy, path)).toMatchObject({
      target: environment.VITE_CIRCA_MEDIA_TARGET ?? "http://127.0.0.1:4312",
    });
  expect(firstMatch(proxy, "/nodics/eWaste/v0/submissions/item/photo")).toMatchObject({
    target: environment.VITE_CIRCA_BACKEND_PROXY_TARGET ?? "http://127.0.0.1:4370",
  });
});
