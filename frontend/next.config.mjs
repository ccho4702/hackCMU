const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy /api/* to FastAPI so the browser only ever talks to this origin (no CORS).
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
  experimental: {
    // Default is 30s; voice cloning + TTS can take longer than that.
    proxyTimeout: 120_000,
  },
};

export default nextConfig;
