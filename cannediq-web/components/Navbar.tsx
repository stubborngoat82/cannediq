'use client';

import Link from 'next/link';
import { ReactNode, useState } from 'react';
import Logo from './Logo';

const CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/njfecjkiffcmgmhdomjbcfcahgajnhii';

export interface NavLink {
  label: string;
  href: string;
}

// Default links for marketing pages (home, about, etc.)
export const MARKETING_LINKS: NavLink[] = [
  { label: 'Features',     href: '/#features' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'AI',           href: '/#ai' },
  { label: 'Docs',         href: '/docs' },
  { label: 'Pricing',      href: '/pricing' },
  { label: 'Privacy',      href: '/privacy' },
];

// Condensed links for pricing / secondary pages
export const PRICING_LINKS: NavLink[] = [
  { label: 'Features', href: '/#features' },
  { label: 'Pricing',  href: '/pricing' },
  { label: 'FAQ',      href: '#faq' },
];

interface NavbarProps {
  links?: NavLink[];
  /** Slot for right-side CTA buttons. Defaults to "Add to Chrome". */
  cta?: ReactNode;
  /** Use fixed positioning (for pages with a hero that accounts for it). Default: sticky. */
  fixed?: boolean;
}

/** Default CTA — "Add to Chrome" external link */
function AddToChromeCTA() {
  return (
    <a
      href={CHROME_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="btn-primary text-[13px]"
      style={{ padding: '8px 18px', borderRadius: 8 }}
    >
      Add to Chrome
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        aria-hidden="true"
      >
        <path d="M7 17L17 7M7 7h10v10" />
      </svg>
    </a>
  );
}

export default function Navbar({
  links = MARKETING_LINKS,
  cta = <AddToChromeCTA />,
  fixed = false,
}: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const positionClass = fixed
    ? 'fixed top-0 left-0 right-0 z-50 nav-blur'
    : 'sticky top-0 z-50 border-b border-[#1E293B] backdrop-blur bg-[#0F172A]/90';

  return (
    <header className={positionClass}>
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Logo />

        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center gap-6 text-sm text-muted" aria-label="Main navigation">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="hover:text-light transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          {cta}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden flex flex-col gap-1.5 p-2 text-muted hover:text-light transition-colors"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
        >
          <span
            className={`block w-5 h-0.5 bg-current transition-transform duration-200 ${
              mobileOpen ? 'translate-y-2 rotate-45' : ''
            }`}
          />
          <span
            className={`block w-5 h-0.5 bg-current transition-opacity duration-200 ${
              mobileOpen ? 'opacity-0' : ''
            }`}
          />
          <span
            className={`block w-5 h-0.5 bg-current transition-transform duration-200 ${
              mobileOpen ? '-translate-y-2 -rotate-45' : ''
            }`}
          />
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[#1E293B] bg-[#0F172A]">
          <nav className="flex flex-col px-6 py-4 gap-4" aria-label="Mobile navigation">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-muted hover:text-light transition-colors"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-2 border-t border-[#1E293B]">
              {cta}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
