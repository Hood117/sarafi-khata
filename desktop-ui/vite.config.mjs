import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === "win32";

/**
 * `@vitejs/plugin-react-swc` re-enables Vite's esbuild transform for production
 * builds unless SWC plugins / mutateSwcOptions are set. On Windows that esbuild
 * child process frequently dies (EPIPE / "service is no longer running").
 * Force SWC for build and keep esbuild disabled after other plugins merge config.
 *
 * IMPORTANT: This file must stay `.mjs` (not `.ts`). Loading a TypeScript Vite
 * config itself shells out to esbuild, which antivirus often kills on Windows.
 */
function forceDisableEsbuild() {
  return {
    name: "asms:force-disable-esbuild",
    enforce: "post",
    config() {
      return { esbuild: false };
    },
  };
}

export default defineConfig({
  root: rootDir,
  // Relative asset paths so the packaged WebView loads ./assets/* (not /assets/*).
  base: "./",
  plugins: [
    react({
      // Selects the SWC `apply: "build"` transform path instead of esbuild JSX.
      useAtYourOwnRisk_mutateSwcOptions(opts) {
        return opts;
      },
    }),
    forceDisableEsbuild(),
  ],
  clearScreen: false,
  esbuild: false,
  server: {
    host: "127.0.0.1",
    port: 1421,
    strictPort: true,
    hmr: { overlay: false },
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "../src"),
      "@desktop": path.resolve(rootDir, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "esnext",
    minify: false,
    cssMinify: false,
  },
  optimizeDeps: {
    /**
     * Windows antivirus (commonly Smadav) kills the esbuild child used for
     * dependency discovery ("The service is no longer running"). Skip scanning
     * and prebundling so `tauri dev` / `dev:spa` can start without esbuild.
     */
    noDiscovery: true,
    include: [],
    ...(isWindows ? { holdUntilCrawlEnd: false } : {}),
  },
});
