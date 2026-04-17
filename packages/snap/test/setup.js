// Polyfill globalThis.crypto for the snaps-jest simulation environment.
// The real MetaMask Snap runtime provides crypto natively, but the
// test simulator (snaps-jest) does not include it by default.
const { webcrypto } = require("node:crypto");

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}
