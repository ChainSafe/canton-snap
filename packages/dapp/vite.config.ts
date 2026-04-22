import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  envDir: "../../", // read .env from monorepo root
  server: {
    port: 3000,
    strictPort: false, // auto-increment if 3000 is busy
  },
});
