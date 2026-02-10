import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages project site (https://agusbudbudi.github.io/qa-tools/)
  base: "/qa-tools/",
  plugins: [react()],
  server: {
    port: 5173,
  },
});
