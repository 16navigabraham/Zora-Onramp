import type { NextConfig } from "next";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://zora-onramp-backend.onrender.com';

const nextConfig: NextConfig = {
  /* config options here */
  async rewrites() {
    return [
      {
        source: '/api/orders/:path*',
        destination: `${BACKEND_URL}/api/orders/:path*`,
      },
      {
        source: '/api/zora/:path*',
        destination: `${BACKEND_URL}/api/zora/:path*`,
      },
      // Keep the backend prefix for backward compatibility
      {
        source: '/api/backend/:path*',
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
