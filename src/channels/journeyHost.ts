/** Device capabilities are normalized here; business arrival decisions remain on the backend. */
export type LocationPermission =
  | "granted"
  | "prompt"
  | "denied"
  | "unknown"
  | "unavailable";
export type Position = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  capturedAt: number;
};
/** Backend policy is a capture hint; the server still decides whether arrival is valid. */
export type LocationRequirements = {
  maximumAccuracyMetres?: number;
  maximumPositionAgeMs?: number;
};
export interface JourneyHost {
  kind: "web" | "telegram";
  permission(): Promise<LocationPermission>;
  capture(signal: AbortSignal, timeoutMs: number, requirements?: LocationRequirements): Promise<Position>;
  openMap(url: string): void;
  openLocationSettings?: () => void;
  setClosingConfirmation?: (enabled: boolean) => void;
  bindBack?: (handler: () => void) => () => void;
}
export interface TelegramApp {
  initData: string;
  ready(): void;
  expand(): void;
  isVersionAtLeast?(version: string): boolean;
  enableClosingConfirmation?(): void;
  disableClosingConfirmation?(): void;
  openLink?(url: string): void;
  BackButton?: {
    show(): void;
    hide(): void;
    onClick(handler: () => void): void;
    offClick(handler: () => void): void;
  };
  LocationManager?: {
    isInited: boolean;
    isLocationAvailable: boolean;
    isAccessRequested: boolean;
    isAccessGranted: boolean;
    init(callback: () => void): void;
    getLocation(
      callback: (
        value: {
          latitude: number;
          longitude: number;
          horizontal_accuracy: number | null;
        } | null,
      ) => void,
    ): void;
    openSettings(): void;
  };
}
declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramApp };
  }
}
/** Bounds native callbacks and ignores observations after journey cancellation. */
function bounded<T>(
  signal: AbortSignal,
  timeoutMs: number,
  operation: (
    resolve: (value: T) => void,
    reject: (error: Error) => void,
  ) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error: Error | null, value?: T) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(value as T);
    };
    const abort = () =>
      finish(new DOMException("Location check cancelled", "AbortError"));
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            "Location is taking too long. Check device location and try again.",
          ),
        ),
      timeoutMs,
    );
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    try {
      operation(
        (value) => finish(null, value),
        (error) => finish(error),
      );
    } catch (error) {
      finish(
        error instanceof Error ? error : new Error("Location unavailable"),
      );
    }
  });
}
export const webJourneyHost: JourneyHost = {
  kind: "web",
  async permission() {
    if (!navigator.geolocation) return "unavailable";
    try {
      return navigator.permissions
        ? (await navigator.permissions.query({ name: "geolocation" })).state
        : "unknown";
    } catch {
      return "unknown";
    }
  },
  capture(signal, timeoutMs) {
    return bounded(signal, timeoutMs, (resolve, reject) =>
      navigator.geolocation.getCurrentPosition(
        (value) =>
          resolve({
            latitude: value.coords.latitude,
            longitude: value.coords.longitude,
            accuracy: value.coords.accuracy,
            capturedAt: value.timestamp,
          }),
        (error) =>
          reject(
            new Error(
              error.code === 1
                ? "Location access is blocked. Enable it in your browser settings, then retry."
                : "Your location is unavailable. Check device location and retry.",
            ),
          ),
        { maximumAge: 0, enableHighAccuracy: true, timeout: timeoutMs },
      ),
    );
  },
  openMap(url) {
    const target = new URL(url);
    if (target.protocol === "https:")
      window.open(target.href, "_blank", "noopener,noreferrer");
  },
};
/** Uses Telegram native access state when supported; older clients retain browser capture. */
export function telegramJourneyHost(app: TelegramApp): JourneyHost {
  const manager =
    !app.isVersionAtLeast || app.isVersionAtLeast("8.0")
      ? app.LocationManager
      : undefined;
  return {
    ...webJourneyHost,
    kind: "telegram",
    bindBack(handler) {
      const back = !app.isVersionAtLeast || app.isVersionAtLeast("6.1") ? app.BackButton : undefined;
      back?.onClick(handler);
      back?.show();
      return () => { back?.offClick(handler); back?.hide(); };
    },
    async permission() {
      if (!manager) return webJourneyHost.permission();
      if (!manager.isInited)
        await bounded(new AbortController().signal, 5000, (resolve) =>
          manager.init(() => resolve(true)),
        );
      if (!manager.isLocationAvailable) return "unavailable";
      return manager.isAccessGranted
        ? "granted"
        : manager.isAccessRequested
          ? "denied"
          : "prompt";
    },
    async capture(signal, timeoutMs, requirements) {
      const deadline = Date.now() + timeoutMs;
      const remaining = () => Math.max(1, deadline - Date.now());
      if (manager && !manager.isInited)
        await bounded(signal, Math.min(5000, remaining()), (resolve) =>
          manager.init(() => resolve(true)),
        );
      if (!manager) return webJourneyHost.capture(signal, remaining(), requirements);
      const native = await bounded<Position>(signal, remaining(), (resolve, reject) =>
        manager.getLocation((value) =>
          value
            ? resolve({
                latitude: value.latitude,
                longitude: value.longitude,
                accuracy: value.horizontal_accuracy,
                capturedAt: Date.now(),
              })
            : reject(
                new Error(
                  "Location access is unavailable. Check Telegram location settings and retry.",
                ),
              ),
        ),
      );
      // Desktop Telegram can supply coordinates without horizontal accuracy.
      // Try the browser's real reading; never fabricate accuracy or retry a denied native grant.
      const knownAccuracy = (p: Position) => typeof p.accuracy === "number" && Number.isFinite(p.accuracy) && p.accuracy >= 0;
      const needsFallback = !knownAccuracy(native) || (requirements?.maximumAccuracyMetres !== undefined && native.accuracy! > requirements.maximumAccuracyMetres);
      if (!needsFallback || !navigator.geolocation || remaining() <= 1) return native;
      try {
        const browser = await webJourneyHost.capture(signal, remaining(), requirements);
        const fresh = Number.isFinite(browser.capturedAt) && Date.now() - browser.capturedAt <= (requirements?.maximumPositionAgeMs ?? timeoutMs);
        if (fresh && knownAccuracy(browser) && (!knownAccuracy(native) || browser.accuracy! < native.accuracy!)) return browser;
      } catch (error) {
        if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
        // Preserve the truthful native observation for the server's specific recovery response.
      }
      return native;
    },
    setClosingConfirmation(enabled) {
      if (app.isVersionAtLeast && !app.isVersionAtLeast("6.2")) return;
      if (enabled) app.enableClosingConfirmation?.();
      else app.disableClosingConfirmation?.();
    },
    openMap(url) {
      const target = new URL(url);
      if (target.protocol !== "https:") return;
      if (app.openLink) app.openLink(url);
      else webJourneyHost.openMap(url);
    },
    ...(manager ? { openLocationSettings: () => manager.openSettings() } : {}),
  };
}
