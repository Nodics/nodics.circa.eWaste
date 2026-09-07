import type { ReactNode } from 'react';

import type { SiteShellContent } from './circaExperience';

function NodicsBrand() {
  return (
    <svg aria-hidden="true" className="brand-mark" viewBox="0 0 56 42" focusable="false">
      <path
        d="M17 6H8v30h9M39 6h9v30h-9"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4"
      />
      <text
        dominantBaseline="middle"
        fill="currentColor"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="22"
        fontWeight="700"
        textAnchor="middle"
        x="28"
        y="22"
      >
        N
      </text>
    </svg>
  );
}

export function NodicsSiteShell({
  accountSlot,
  children,
  notice,
  shell,
}: {
  readonly accountSlot: ReactNode;
  readonly children: ReactNode;
  readonly notice: string;
  readonly shell: SiteShellContent;
}) {
  return (
    <div className="site-shell circa-app">
      <header className="site-header">
        <div className="site-header-inner">
          <a className="brand" href="#home" aria-label={`${shell.brandLabel} ${shell.brandSubtitle}`}>
            <NodicsBrand />
            <span className="brand-lockup">
              <strong>{shell.brandLabel}</strong>
              <small>{shell.brandSubtitle}</small>
            </span>
          </a>
          <nav className="primary-navigation" aria-label="Circa navigation">
            {shell.navigation.map((item) => (
              <a href={item.href} key={item.href}>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="header-actions">{accountSlot}</div>
        </div>
      </header>

      {children}

      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <a className="brand inverse" href="#home" aria-label={`${shell.brandLabel} ${shell.brandSubtitle}`}>
              <NodicsBrand />
              <span className="brand-lockup">
                <strong>{shell.brandLabel}</strong>
                <small>{shell.brandSubtitle}</small>
              </span>
            </a>
            <p>{shell.brandSummary}</p>
          </div>
          {shell.footerGroups.map((group) => (
            <div className="footer-group" key={group.title}>
              <h3>{group.title}</h3>
              {group.links.map((link) => (
                <a href={link.href} key={`${group.title}-${link.label}`}>
                  {link.label}
                </a>
              ))}
            </div>
          ))}
        </div>
        <div className="footer-legal">
          <span>{shell.legalText}</span>
          <span>{notice}</span>
        </div>
      </footer>
    </div>
  );
}
