import { useEffect, useId, useRef, useState } from "react";
import type { JourneyHost } from "../../channels/journeyHost";

/** Telegram settings manage a denied bot grant, not device accuracy or OS settings. */
export function LocationAccessHelp({ host, permission, hasError }: {
  host: JourneyHost;
  permission: string;
  hasError: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const instructions = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (expanded) instructions.current?.scrollIntoView?.({ block: "center", behavior: "auto" });
  }, [expanded]);
  if (!hasError && permission !== "denied" && permission !== "unavailable") return null;
  const telegram = host.kind === "telegram";
  const openPermissions = () => {
    // Always provide visible recovery when a client ignores or rejects the SDK action.
    setExpanded(true);
    try { host.openLocationSettings?.(); } catch { /* Manual instructions stay visible. */ }
  };
  return <div className="location-access-help">
    {telegram && permission === "denied" && host.openLocationSettings &&
      <button className="text-button mobile-text" type="button" onClick={openPermissions}>Open Telegram permissions</button>}
    <button className="text-button mobile-text" type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>Location help</button>
    {expanded && <div id={id} ref={instructions} className="location-access-instructions" role="region" aria-label="Location help">
      {telegram && permission === "granted" && <p>Telegram already has permission to use your location.</p>}
      {telegram && permission === "denied" && <p>Allow location access in Circa’s Telegram bot permissions. If nothing opens, open the bot’s profile in Telegram to manage its permissions.</p>}
      <p>{host.platform === "macos"
        ? "On your Mac, open System Settings → Privacy & Security → Location Services and check Telegram. Keep Wi-Fi on."
        : telegram
          ? "In your device’s location settings, allow Telegram to use your location. Enable precise location if available. On desktop, keep Wi-Fi on."
          : "Allow location access for your browser in your device settings and for this website in your browser. On desktop, keep Wi-Fi on."}</p>
      <p>Return to Circa and check location again. Arrival requires a fresh location within the configured radius of an available centre. You can still browse centres if arrival cannot be confirmed.</p>
    </div>}
  </div>;
}
