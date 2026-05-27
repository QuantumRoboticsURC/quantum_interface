import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env["TAURI_DEV_HOST"];

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // OpenCV is no longer bundled — it is loaded as a <script> in index.html
  // (see /public/opencv.js), so it doesn't need to go through Vite at all.

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));