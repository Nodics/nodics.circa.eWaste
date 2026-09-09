import { CircaBrand } from '../CircaBrand';
import { contentText, type Content } from '../cms';

/** Compact presentation of the website footer; its brand copy remains CMS-owned. */
export function MobileSiteFooter({ content, onHome }: { content?: Content; onHome: () => void }) {
  if (!content) return null;
  return <footer className="mobile-site-footer">
    <CircaBrand light content={content} onClick={event => { event.preventDefault(); onHome(); }}/>
    <p>{contentText(content, 'footer')}</p>
    <span className="mobile-site-footer-caption">{contentText(content, 'caption')}</span>
    <div className="mobile-site-footer-bottom"><small>© {new Date().getFullYear()} Nodics. Circa eWaste.</small><nav aria-label="Legal"><a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy</a><a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a></nav></div>
  </footer>;
}
