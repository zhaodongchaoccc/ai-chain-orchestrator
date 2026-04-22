import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const consoleHost = process.env.FF_CONSOLE_HOST ?? "127.0.0.1";
const consolePort = Number(process.env.FF_CONSOLE_PORT ?? 8787);
const webPort = Number(process.env.FF_CONSOLE_WEB_PORT ?? 4173);
const backendTarget = `http://${consoleHost}:${consolePort}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: webPort,
    proxy: {
      "/api": backendTarget,
      "/health": backendTarget
    }
  }
});
