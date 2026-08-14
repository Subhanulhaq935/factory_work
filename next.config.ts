import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Ensure the service worker is never cached by the browser —
        // this allows SW updates to propagate immediately.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type",  value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
