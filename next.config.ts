import type { NextConfig } from "next";

/**
 * Desktop packaging uses Next.js `standalone` output so Prisma + Server Actions
 * keep working inside the Tauri WebView (local Node sidecar).
 * Never use `output: "export"` — static HTML cannot run the offline ledger backend.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    unoptimized: true,
  },
  experimental: {
    authInterrupts: true,
  },
  // Keep the desktop sidecar lean — never ship the Rust tree / docs into
  // `.next/standalone` (that alone can be multi-GB and fill the disk).
  outputFileTracingExcludes: {
    "*": [
      "./src-tauri/**/*",
      "./docs/**/*",
      "./scripts/**/*",
      "./.git/**/*",
      "./agent-transcripts/**/*",
    ],
  },
};

export default nextConfig;
