import Link from 'next/link';
import Logo from './Logo';

const CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/njfecjkiffcmgmhdomjbcfcahgajnhii';

const FOOTER_LINKS = [
  { label: 'Docs',         href: '/docs' },
  { label: 'Privacy',      href: '/privacy' },
  { label: 'Terms',        href: '/terms' },
  { label: 'Contact',      href: 'mailto:hello@cannediq.com' },
  { label: 'Chrome Store', href: CHROME_STORE_URL, external: true },
];

export default function Footer() {
  return (
    <footer className="py-10 border-t border-[#1E293B]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">

          {/* Logo + tagline */}
          <div className="flex items-center gap-3">
            <Logo iconSize={26} showWordmark={false} asLink={false} />
            <div>
              <div className="font-display font-bold text-sm text-light">
                canned<span style={{ color: '#3B82F6' }}>IQ</span>
              </div>
              <div className="text-xs" style={{ color: 'rgba(148,163,184,.5)' }}>
                Your responses. On command.
              </div>
            </div>
          </div>

          {/* Nav links */}
          <nav className="flex flex-wrap justify-center items-center gap-6 text-sm text-muted" aria-label="Footer navigation">
            {FOOTER_LINKS.map((link) =>
              link.external ? (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-light transition-colors"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className="hover:text-light transition-colors"
                >
                  {link.label}
                </Link>
              )
            )}
          </nav>

          {/* Copyright */}
          <p className="text-xs" style={{ color: 'rgba(148,163,184,.4)' }}>
            © 2026 cannedIQ · AHPUSHIT LLC · All rights reserved.
          </p>

        </div>
      </div>
    </footer>
  );
}
