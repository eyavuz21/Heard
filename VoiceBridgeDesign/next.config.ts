import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Parent repo has its own package-lock; keep tracing rooted on this app.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
