import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: "/contact-ui/",
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
      "/send-otp": { target: "http://localhost:3000", changeOrigin: true },
      "/verify-otp": { target: "http://localhost:3000", changeOrigin: true },
      "/contact": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
  build: {
    outDir: "../contact-ui",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "contact-verify.js",
        assetFileNames: "contact-verify[extname]",
      },
    },
  },
});
