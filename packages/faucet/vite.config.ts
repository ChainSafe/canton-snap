// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  envDir: "../../", // read .env from monorepo root
  server: {
    port: 3001,
    strictPort: false, // auto-increment if 3001 is busy
  },
});
