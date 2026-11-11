import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // CORS is applied in proxy.ts so the allow-list can match the request Origin
  // (the web app and chrome-extension://<id>). A static "*" header cannot.
};

export default nextConfig;
