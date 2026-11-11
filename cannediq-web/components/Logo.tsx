import Image from 'next/image';
import Link from 'next/link';

interface LogoProps {
  /** Size of the icon in pixels. Default: 28 */
  iconSize?: number;
  /** Show the wordmark ("cannedIQ") next to the icon. Default: true */
  showWordmark?: boolean;
  /** Wrap the logo in a link to "/". Default: true */
  asLink?: boolean;
  className?: string;
}

export default function Logo({
  iconSize = 28,
  showWordmark = true,
  asLink = true,
  className = '',
}: LogoProps) {
  const content = (
    <span className={`flex items-center gap-2.5 ${className}`}>
      {/* White pill icon wrapper */}
      <span
        className="logo-pill"
        style={{ borderRadius: Math.round(iconSize * 0.35) }}
      >
        <Image
          src="/IQicon.png"
          alt="cannedIQ icon"
          width={iconSize}
          height={iconSize}
          style={{ display: 'block', borderRadius: Math.round(iconSize * 0.21) }}
          priority
        />
      </span>

      {showWordmark && (
        <span className="font-display font-bold text-light text-[15px] tracking-tight leading-none">
          canned<span style={{ color: '#3B82F6' }}>IQ</span>
        </span>
      )}
    </span>
  );

  if (!asLink) return content;

  return (
    <Link href="/" className="flex items-center">
      {content}
    </Link>
  );
}
