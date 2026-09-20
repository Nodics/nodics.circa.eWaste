import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  telegramJourneyHost,
  webJourneyHost,
  type TelegramApp,
} from "./journeyHost";

afterEach(() => vi.restoreAllMocks());
describe("host location boundaries", () => {
  it("reads a grant without requesting another permission", async () => {
    const capture = vi.fn();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: capture },
    });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: vi.fn(async () => ({ state: "granted" })) },
    });
    expect(await webJourneyHost.permission()).toBe("granted");
    expect(capture).not.toHaveBeenCalled();
  });
  it("falls back to one native capture when permission introspection is unavailable", async () => {
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: undefined,
    });
    const capture = vi.fn((resolve, _error, _options) =>
      resolve({
        coords: { latitude: 25, longitude: 55, accuracy: 8 },
        timestamp: 100,
      }),
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: capture },
    });
    expect(await webJourneyHost.permission()).toBe("unknown");
    expect(
      (await webJourneyHost.capture(new AbortController().signal, 20))
        .capturedAt,
    ).toBe(100);
    expect(capture).toHaveBeenCalledOnce();
    expect(capture.mock.calls[0][2]).toMatchObject({
      maximumAge: 0,
      enableHighAccuracy: true,
    });
  });
  it("cancels a stalled callback and ignores a late observation", async () => {
    let success: (value: unknown) => void = () => {};
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (resolve: (value: unknown) => void) => {
          success = resolve;
        },
      },
    });
    const control = new AbortController(),
      result = webJourneyHost.capture(control.signal, 1000);
    control.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    success({
      coords: { latitude: 25, longitude: 55, accuracy: 8 },
      timestamp: 100,
    });
  });
  it("uses Telegram native permission and preserves unknown accuracy for backend rejection", async () => {
    const manager = {
      isInited: true,
      isLocationAvailable: true,
      isAccessRequested: true,
      isAccessGranted: true,
      init: vi.fn(),
      getLocation: vi.fn((callback) =>
        callback({ latitude: 25, longitude: 55, horizontal_accuracy: null }),
      ),
      openSettings: vi.fn(),
    };
    const app = {
      initData: "signed",
      ready: vi.fn(),
      expand: vi.fn(),
      LocationManager: manager,
    } as TelegramApp;
    const host = telegramJourneyHost(app);
    expect(await host.permission()).toBe("granted");
    expect(
      (await host.capture(new AbortController().signal, 100)).accuracy,
    ).toBeNull();
    manager.isAccessGranted = false;
    expect(await host.permission()).toBe("denied");
    host.openLocationSettings?.();
    expect(manager.openSettings).toHaveBeenCalledOnce();
  });
});
it("older Telegram clients use browser location even when the SDK exposes an unsupported native manager", async () => {
  const manager = {
    isInited: false,
    isLocationAvailable: false,
    isAccessRequested: false,
    isAccessGranted: false,
    init: vi.fn(),
    getLocation: vi.fn(),
    openSettings: vi.fn(),
  };
  const capture = vi.fn((success) =>
    success({
      coords: { latitude: 25, longitude: 55, accuracy: 5 },
      timestamp: Date.now(),
    }),
  );
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: capture },
  });
  const host = telegramJourneyHost({
    initData: "signed",
    ready() {},
    expand() {},
    isVersionAtLeast: () => false,
    LocationManager: manager,
  });
  await host.capture(new AbortController().signal, 100);
  expect(capture).toHaveBeenCalledOnce();
  expect(manager.getLocation).not.toHaveBeenCalled();
});
it("native capture initializes its manager and does not open unsafe direction links", async () => {
  const manager = {
    isInited: false,
    isLocationAvailable: true,
    isAccessRequested: true,
    isAccessGranted: true,
    init: vi.fn((callback) => {
      manager.isInited = true;
      callback();
    }),
    getLocation: vi.fn((callback) =>
      callback({ latitude: 25, longitude: 55, horizontal_accuracy: 5 }),
    ),
    openSettings: vi.fn(),
  };
  const openLink = vi.fn();
  const host = telegramJourneyHost({
    initData: "signed",
    ready() {},
    expand() {},
    openLink,
    LocationManager: manager,
  });
  await host.capture(new AbortController().signal, 100);
  expect(manager.init).toHaveBeenCalledOnce();
  host.openMap("javascript:alert(1)");
  expect(openLink).not.toHaveBeenCalled();
  host.openMap("https://maps.google.com/");
  expect(openLink).toHaveBeenCalledOnce();
});

function desktopHost(accuracy: number | null) {
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: vi.fn() } });
  return telegramJourneyHost({
    initData: "signed", ready() {}, expand() {},
    LocationManager: {
      isInited: true, isLocationAvailable: true, isAccessRequested: true, isAccessGranted: true,
      init() {}, openSettings() {},
      getLocation: callback => callback({ latitude: 25, longitude: 55, horizontal_accuracy: accuracy }),
    },
  });
}
it.each([null, 200])("recovers native accuracy %s through an actual browser reading", async accuracy => {
  const host = desktopHost(accuracy);
  const observation = { latitude: 25.001, longitude: 55.001, accuracy: 10, capturedAt: Date.now() };
  const browser = vi.spyOn(webJourneyHost, "capture").mockResolvedValue(observation);
  const result = await host.capture(new AbortController().signal, 1000, { maximumAccuracyMetres: 50, maximumPositionAgeMs: 60000 });
  expect(result).toEqual(observation);
  expect(browser).toHaveBeenCalledOnce();
});
it("does not replace precise native capture or use stale browser evidence", async () => {
  let host = desktopHost(5);
  const browser = vi.spyOn(webJourneyHost, "capture").mockResolvedValue({ latitude: 25, longitude: 55, accuracy: 1, capturedAt: Date.now() - 61000 });
  expect((await host.capture(new AbortController().signal, 1000, { maximumAccuracyMetres: 50 })).accuracy).toBe(5);
  expect(browser).not.toHaveBeenCalled();
  host = desktopHost(null);
  expect((await host.capture(new AbortController().signal, 1000, { maximumAccuracyMetres: 50, maximumPositionAgeMs: 60000 })).accuracy).toBeNull();
});
it("a failed fallback keeps unknown accuracy and cancellation is never converted to success", async () => {
  const host = desktopHost(null);
  const browser = vi.spyOn(webJourneyHost, "capture").mockRejectedValue(new Error("Browser location unavailable"));
  expect((await host.capture(new AbortController().signal, 1000, { maximumAccuracyMetres: 50 })).accuracy).toBeNull();
  browser.mockRejectedValue(new DOMException("cancelled", "AbortError"));
  await expect(host.capture(new AbortController().signal, 1000, { maximumAccuracyMetres: 50 })).rejects.toMatchObject({ name: "AbortError" });
});
it("native denial does not request browser location", async () => {
  const browser = vi.spyOn(webJourneyHost, "capture");
  const host = telegramJourneyHost({ initData: "signed", ready() {}, expand() {}, LocationManager: {
    isInited: true, isLocationAvailable: true, isAccessRequested: true, isAccessGranted: false,
    init() {}, openSettings() {}, getLocation: callback => callback(null),
  } });
  await expect(host.capture(new AbortController().signal, 1000)).rejects.toThrow(/Telegram location settings/);
  expect(browser).not.toHaveBeenCalled();
});

it('exposes native Back only when the client supports it and removes its handler on exit', () => {
  const back = { show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn() };
  const app = { initData:'signed', ready() {}, expand() {}, BackButton:back };
  expect(telegramJourneyHost({ ...app, isVersionAtLeast: () => false }).bindBack).toBeUndefined();
  expect(telegramJourneyHost({ ...app, BackButton:undefined }).bindBack).toBeUndefined();
  const handler = vi.fn();
  const dispose = telegramJourneyHost(app).bindBack!(handler);
  expect(back.onClick).toHaveBeenCalledWith(handler);
  expect(back.show).toHaveBeenCalledOnce();
  dispose();
  expect(back.offClick).toHaveBeenCalledWith(handler);
  expect(back.hide).toHaveBeenCalledOnce();
});

describe("arrival capture refinement", () => {
  let observe: PositionCallback;
  let fail: PositionErrorCallback;
  let clearWatch: ReturnType<typeof vi.fn>;
  const emit = (accuracy: number) => observe({ coords: { latitude: 25.1, longitude: 55.2, accuracy }, timestamp: Date.now() } as GeolocationPosition);
  const capture = () => webJourneyHost.capture(new AbortController().signal, 1000, { maximumAccuracyMetres: 50 });
  beforeEach(() => {
    vi.useFakeTimers();
    clearWatch = vi.fn();
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      watchPosition: vi.fn((success, error) => { observe = success; fail = error; return 71; }), clearWatch,
    } });
  });
  afterEach(() => vi.useRealTimers());
  it.each(["web", "telegram"])("%s waits past a coarse reading and returns the precise device fix", async kind => {
    const host = kind === "web" ? webJourneyHost : telegramJourneyHost({ initData: "signed", ready() {}, expand() {}, LocationManager: {
      isInited: true, isLocationAvailable: true, isAccessRequested: true, isAccessGranted: true, init() {}, openSettings() {},
      getLocation: callback => callback({ latitude: 25.1, longitude: 55.2, horizontal_accuracy: 900 }),
    } });
    const result = host.capture(new AbortController().signal, 1000, { maximumAccuracyMetres: 50 });
    await vi.advanceTimersByTimeAsync(0);
    let settled = false;
    void result.then(() => { settled = true; });
    emit(700);
    await vi.advanceTimersByTimeAsync(250);
    expect(settled).toBe(false);
    emit(12);
    expect(await result).toMatchObject({ latitude: 25.1, longitude: 55.2, accuracy: 12, capturedAt: Date.now() });
    expect(clearWatch).toHaveBeenCalledWith(71);
  });
  it("returns the best real coarse reading at the deadline without granting arrival", async () => {
    const result = capture();
    emit(700); emit(180); emit(400);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await result).accuracy).toBe(180);
    expect(clearWatch).toHaveBeenCalledWith(71);
  });
  it("cancels and stops watching even after a coarse fix", async () => {
    const control = new AbortController();
    const result = webJourneyHost.capture(control.signal, 1000, { maximumAccuracyMetres: 50 });
    emit(700);
    const assertion = expect(result).rejects.toMatchObject({ name: "AbortError" });
    control.abort(); await assertion;
    emit(5);
    expect(clearWatch).toHaveBeenCalledOnce();
  });
  it("does not return an earlier reading after permission is denied", async () => {
    const result = capture(); emit(700);
    const assertion = expect(result).rejects.toThrow("Location access is blocked");
    fail({ code: 1 } as GeolocationPositionError);
    await assertion; expect(clearWatch).toHaveBeenCalledOnce();
  });
  it("expires without a fix and releases the watch", async () => {
    const result = capture();
    const assertion = expect(result).rejects.toThrow("Your location is unavailable");
    await vi.advanceTimersByTimeAsync(1000); await assertion;
    expect(clearWatch).toHaveBeenCalledOnce();
  });
});

it.each([null, 125, 3000])("uses native coordinates directly when arrival has no accuracy gate: %s", async accuracy => {
  const host = desktopHost(accuracy);
  const browser = vi.spyOn(webJourneyHost, "capture");
  const result = await host.capture(new AbortController().signal, 1000, { maximumPositionAgeMs: 60000 });
  expect(result).toMatchObject({ latitude: 25, longitude: 55, accuracy });
  expect(browser).not.toHaveBeenCalled();
});
