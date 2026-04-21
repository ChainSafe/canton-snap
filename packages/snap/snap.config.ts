import type { SnapConfig } from "@metamask/snaps-cli";
import { config as loadEnv } from "dotenv";
import { resolve } from "path";

// Load root .env so VITE_SNAP_PORT is the single source of truth for the port
loadEnv({ path: resolve(__dirname, "../../.env"), override: false });

const snapPort = parseInt(process.env.VITE_SNAP_PORT ?? "8080", 10);

const config: SnapConfig = {
  input: "src/index.ts",
  output: {
    path: "dist",
  },
  polyfills: {
    buffer: true,
  },
  stats: {
    buffer: false,
  },
  server: {
    port: snapPort,
  },
};

export default config;
