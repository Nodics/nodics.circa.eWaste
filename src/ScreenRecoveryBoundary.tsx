import { Component, type ReactNode } from "react";
/** Keeps an unexpected rendering failure from leaving a blank customer screen. Server-owned progress is recovered by reopening. */
export class ScreenRecoveryBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="screen-recovery">
        <h1>Let’s reopen Circa</h1>
        <p>Something interrupted the screen. Your saved progress is kept.</p>
        <button className="primary" onClick={() => window.location.reload()}>
          Reload Circa
        </button>
        <p>
          If you are in Telegram and it still doesn’t open, close Circa and
          reopen it from the bot.
        </p>
      </main>
    ) : (
      this.props.children
    );
  }
}
