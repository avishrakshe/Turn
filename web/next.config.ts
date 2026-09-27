import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript sources.
  transpilePackages: ["@turn/contracts", "@turn/relayer"],
  poweredByHeader: false,
};

export default nextConfig;
