import type { NextConfig } from "next";

// Tauri sets TAURI_ENV_PLATFORM during `tauri build`.
// Static export is used only for desktop packaging; normal builds stay server-capable for Prisma.
const isTauriBuild = !!process.env.TAURI_ENV_PLATFORM;

const nextConfig: NextConfig = {
  output: isTauriBuild ? "export" : undefined,
  images: {
    unoptimized: isTauriBuild,
  },
  experimental: {
    authInterrupts: true,
  },
};

export default nextConfig;
