import { defineConfig } from "vite";
import { fileURLToPath } from "url";

const r = (p) => fileURLToPath(new URL(p, import.meta.url));

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
        main: r("./index.html"),
        broadcaster: r("./broadcaster.html"),
        transmissor: r("./transmissor.html"),
        salas: r("./salas.html"),
      },
    },
  },
});