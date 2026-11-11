import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // CORS headers for all /api/* routes so the Chrome extension
  // (chrome-extension:// origin) can call them directly.
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin',  value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PATCH,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'authorization,content-type,apikey' },
        ],
      },
    ];
  },
};

export default nextConfig;
