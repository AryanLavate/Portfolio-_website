import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget =
    env.VITE_PROXY_API_TARGET?.trim() || "http://localhost:3000";

  return {
    plugins: [react()],
    base: "/contact-ui/",
    server: {
      port: 5173,
      proxy: {
        "/api": { target: proxyTarget, changeOrigin: true },
        "/send-otp": { target: proxyTarget, changeOrigin: true },
        "/verify-otp": { target: proxyTarget, changeOrigin: true },
        "/contact": { target: proxyTarget, changeOrigin: true },
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
  };
});
