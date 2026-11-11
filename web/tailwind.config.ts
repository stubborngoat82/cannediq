import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx,mdx}',
    './components/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg:       '#0F172A',
        card:     '#111827',
        'card-2': '#1E293B',
        blue:     '#3B82F6',
        violet:   '#8B5CF6',
        muted:    '#94A3B8',
        light:    '#F8FAFC',
      },
      fontFamily: {
        sans:    ['var(--font-inter)',           'system-ui', 'sans-serif'],
        display: ['var(--font-space-grotesk)',   'Inter',     'sans-serif'],
        mono:    ['var(--font-jetbrains-mono)',  'monospace'],
      },
      boxShadow: {
        'glow-blue':   '0 0 60px -10px rgba(59,130,246,.35)',
        'glow-violet': '0 0 60px -10px rgba(139,92,246,.35)',
        'glow-dual':   '0 0 80px -10px rgba(59,130,246,.25), 0 0 80px -10px rgba(139,92,246,.2)',
      },
      backgroundImage: {
        'grad-hero': 'linear-gradient(135deg, #60A5FA 0%, #A78BFA 60%, #F472B6 100%)',
        'grad-blue': 'linear-gradient(90deg, #3B82F6, #8B5CF6)',
        'grid-dots': `
          linear-gradient(rgba(59,130,246,.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(59,130,246,.04) 1px, transparent 1px)
        `,
      },
      backgroundSize: {
        'grid': '40px 40px',
      },
    },
  },
  plugins: [],
};

export default config;
