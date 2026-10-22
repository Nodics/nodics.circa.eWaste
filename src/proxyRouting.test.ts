// @vitest-environment node
// Transport configuration fixtures only; no backend is started or qualified.
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import type { UserConfigFnObject, ProxyOptions } from "vite";
import config from "../vite.config";
afterEach(() => vi.unstubAllEnvs());
const modules = ["cart", "checkoutCore", "digitalCore", "bidding", "order"];
it("routes shared Commerce paths before the Waste fallback and honors the explicit target", () => {
  vi.stubEnv("VITE_CIRCA_COMMERCE_TARGET", "https://commerce.example.invalid");
  vi.stubEnv("VITE_CIRCA_BACKEND_PROXY_TARGET", "https://waste.example.invalid");
  const value = (config as UserConfigFnObject)({ command: "serve", mode: "test" });
  const proxy = value.server!.proxy!;
  const target = (path: string) => {
    const key = Object.keys(proxy).find(k => k.startsWith("^") ? new RegExp(k).test(path) : path.startsWith(k));
    return (proxy[key!] as ProxyOptions).target;
  };
  for (const name of modules) expect(target(`/nodics/${name}/v0/example`)).toBe("https://commerce.example.invalid");
  expect(target("/nodics/eWaste/v0/account")).toBe("https://waste.example.invalid");
  expect(target("/nodics/cartOther/v0/example")).toBe("https://waste.example.invalid");
});
it("Docker uses exact Commerce prefixes and retains API protection from the static-assets regex", () => {
  const source = readFileSync(new URL("../docker/nginx.conf", import.meta.url), "utf8");
  for (const name of modules) expect(source).toContain(`location ^~ /nodics/${name}/ { set $upstream "host.docker.internal:5350";`);
  expect(source).toContain('location ^~ /nodics/ { set $upstream "host.docker.internal:5370";');
});
