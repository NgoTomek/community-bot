import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let phones on the same Wi-Fi hit the dev server during the demo.
  // Patterns match the Origin hostname per label ("*" = one label). 172.20.10.x is the iPhone hotspot range.
  allowedDevOrigins: ["*.local", "192.168.*.*", "10.*.*.*", "172.*.*.*", "172.20.10.*", "*.ngrok-free.app", "*.ngrok.app", "*.trycloudflare.com"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
