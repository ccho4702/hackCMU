import path from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function allowedDevOrigins() {
  const raw = process.env.ALLOWED_DEV_ORIGINS || process.env.PUBLIC_ORIGIN || "";
  const hosts = [];
  for (const part of raw.split(",")) {
    const value = part.trim();
    if (!value) continue;
    try {
      const url = new URL(value.includes("://") ? value : `http://${value}`);
      hosts.push(url.hostname);
      hosts.push(url.host);
    } catch {
      hosts.push(value);
    }
  }
  return [...new Set(hosts)];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: allowedDevOrigins(),
  experimental: { proxyTimeout: 600_000, proxyClientMaxBodySize: "500mb" },
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
