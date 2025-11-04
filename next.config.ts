import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async rewrites() {
    return [
      {
        source: '/api/orders/:path*',
        destination: 'https://zora-onramp-backend.onrender.com/api/orders/:path*',
      },
      {
        source: '/api/zora/:path*',
        destination: 'https://zora-onramp-backend.onrender.com/api/zora/:path*',
      },
      // Keep the backend prefix for backward compatibility
      {
        source: '/api/backend/:path*',
        destination: 'https://zora-onramp-backend.onrender.com/api/:path*',
      },
    ];
  },
};

export default nextConfig;
