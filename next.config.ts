import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

// Docker / self-host only. Leave unset for Vercel.
if (process.env.BUILD_STANDALONE === "1") {
  nextConfig.output = "standalone";
}

export default nextConfig;
