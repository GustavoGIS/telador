import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  envDir: ".",
  server: {
    port: 5173,
    allowedHosts: true,
    hmr: { clientPort: 443 },
    proxy: { "/api": "http://localhost:3001" },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        broadcaster: resolve(__dirname, "broadcaster.html"),
      },
    },
  },
});