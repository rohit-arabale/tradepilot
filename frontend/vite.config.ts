import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@server": path.resolve(__dirname, "../backend/src"),
    },
  },
  server: {
    proxy: {
      // YOLO microservice (FastAPI + ultralytics) — run with `cd yolo && uvicorn main:app --port 8000`
      "/yolo": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/yolo/, ""),
      },
    },
  },
});
