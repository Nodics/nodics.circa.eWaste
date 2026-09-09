import { ScreenRecoveryBoundary } from "./ScreenRecoveryBoundary";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { MobileBrowserShell } from "./mobile/MobileBrowserShell";
import { TelegramShell } from "./channels/TelegramShell";
import { CircaApp } from "./CircaApp";
import "./styles.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <ScreenRecoveryBoundary>
      {window.location.pathname === "/telegram" ? (
        <TelegramShell />
      ) : window.location.pathname === "/mobile" ? (
        <MobileBrowserShell />
      ) : (
        <CircaApp />
      )}
    </ScreenRecoveryBoundary>
  </StrictMode>,
);
