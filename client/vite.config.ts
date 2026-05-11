import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Читаем .env из корня репозитория (как server/index.ts), чтобы proxy совпадал с PORT
export default defineConfig(({ mode }) => {
  const rootDir = path.resolve(__dirname, "..");
  const rootEnv = loadEnv(mode, rootDir, "");
  const apiPort = rootEnv.PORT || process.env.PORT || "3001";
  const target = `http://127.0.0.1:${apiPort}`;

  // 30 минут под долгие сборки APK / Gradle / Cordova на первом прогоне
  const longTimeoutMs = 30 * 60 * 1000;

  return {
    plugins: [react()],
    server: {
      port: 3000,
      proxy: {
        "/api": {
          target,
          changeOrigin: true,
          timeout: longTimeoutMs,
          proxyTimeout: longTimeoutMs,
        },
        "/projects": {
          target,
          changeOrigin: true,
          timeout: longTimeoutMs,
          proxyTimeout: longTimeoutMs,
        },
      },
    },
    build: {
      outDir: "dist",
    },
  };
});
