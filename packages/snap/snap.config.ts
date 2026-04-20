import type { SnapConfig } from "@metamask/snaps-cli";

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
    port: 4001,
  },
};

export default config;
