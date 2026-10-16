import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || true,
    allowedHosts: [".ngrok-free.app", ".ngrok.app", ".ngrok.io"],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:38472",
        changeOrigin: true,
      },
    },
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**", "**/data/**", "**/*.sqlite3", "**/*.sqlite3-*"],
    },
  },
  preview: {
    port: 1420,
    strictPort: true,
    host: true,
    allowedHosts: [".ngrok-free.app", ".ngrok.app", ".ngrok.io"],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:38472",
        changeOrigin: true,
      },
    },
  },
}));
