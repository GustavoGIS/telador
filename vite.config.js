import { defineConfig } from "vite";

export default defineConfig({
  envDir: ".",
  server: {
    port: 5173,
    allowedHosts: true,
    hmr: { clientPort: 443 },
    proxy: { "/api": "http://localhost:3001" },
  },
});