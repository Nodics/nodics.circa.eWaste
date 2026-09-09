import type { MouseEventHandler } from 'react';
import { contentText, publicMedia, type Content } from './cms';

/** Shared website and mini-app identity, sourced from the published CMS shell. */
export function CircaBrand({ light = false, content, onClick }: { light?: boolean; content?: Content; onClick?: MouseEventHandler<HTMLAnchorElement> }) {
  const media = content?.[light ? 'lightLogo' : 'logo'] as Content | undefined;
  const source = publicMedia(contentText(media, 'mediaCode'));
  return <a className="brand" href="/" aria-label="Circa by Nodics home" onClick={onClick}>
    {source && <img src={source} alt=""/>}
    <span>{contentText(content, 'brand')}<small>{contentText(content, 'byline')}</small></span>
  </a>;
}
