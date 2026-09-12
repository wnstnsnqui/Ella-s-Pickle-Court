import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Spec 0001: self hosted Docker container, so the build emits a standalone server.
  output: "standalone",
};

export default nextConfig;
