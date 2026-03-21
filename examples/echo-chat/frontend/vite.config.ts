import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/messages": "http://localhost:8001",
      "/openapi.json": "http://localhost:8001",
    },
  },
});
