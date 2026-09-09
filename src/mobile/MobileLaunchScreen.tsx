import { Recycle } from 'lucide-react';

/** Local, immediately available branding while the host and account are restored. */
export function MobileLaunchScreen() {
  return <main className="circa-launch" aria-busy="true" aria-label="Circa">
    <div className="circa-launch-brand" aria-hidden="true">
      <div className="circa-launch-symbol"><Recycle size={50} strokeWidth={1.65}/></div>
      <div className="circa-launch-wordmark">circa<span>.</span></div>
      <p className="circa-launch-tagline">Small actions.<br/>Better tomorrows.</p>
    </div>
    <div className="circa-launch-footer" aria-hidden="true"><span/>A little care. A lasting difference.</div>
    <span className="circa-launch-status" role="status">Opening Circa…</span>
  </main>;
}
