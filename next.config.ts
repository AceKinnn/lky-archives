import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // A stray lockfile in a parent folder can make Next.js guess the wrong
  // workspace root, so pin it to this project.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
