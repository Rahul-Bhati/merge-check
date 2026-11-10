import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "playwright", "prisma"],
};

export default nextConfig;
