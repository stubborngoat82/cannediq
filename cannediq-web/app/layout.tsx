import type { Metadata } from 'next';
import { Inter, Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import './globals.css';

// ── Fonts ──────────────────────────────────────────────────────────────────────
const inter = Inter({
  subsets:  ['latin'],
  weight:   ['400', '500', '600', '700', '800', '900'],
  variable: '--font-inter',
  display:  'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets:  ['latin'],
  weight:   ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display:  'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets:  ['latin'],
  weight:   ['400', '500'],
  variable: '--font-jetbrains-mono',
  display:  'swap',
});

// ── Metadata ───────────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: {
    default:  'cannedIQ — Your responses. On command.',
    template: '%s — cannedIQ',
  },
  description:
    'cannedIQ lets you save, organize, and launch your most-used replies instantly with triggers, shortcuts, and AI-powered commands.',
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? 'https://cannediq.com'
  ),
};

// ── Root Layout ────────────────────────────────────────────────────────────────
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`
        scroll-smooth
        ${inter.variable}
        ${spaceGrotesk.variable}
        ${jetbrainsMono.variable}
      `}
    >
      <body className="font-sans antialiased min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
