import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// SWC for app transforms; esbuild:false avoids Windows "service is no longer running".
export default defineConfig({
  root: rootDir,
  plugins: [react()],
  clearScreen: false,
  esbuild: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
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
  },
  optimizeDeps: {
    // Still uses esbuild for dep prebundle; pin includes so discovery is stable.
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react-router-dom",
      "@tauri-apps/api/core",
    ],
  },
});
