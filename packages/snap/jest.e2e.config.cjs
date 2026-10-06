/**
 * End-to-end config. Separate from jest.config.cjs because these tests need a
 * reachable middleware and a funded party, so they are not part of the default
 * suite. jest.config.cjs ignores test/e2e for the same reason.
 *
 * Run with: npm run test:e2e
 * Required env is listed in test/e2e/README.md and enforced by requireEnv().
 *
 * @type {import('jest').Config}
 */
module.exports = {
  preset: "@metamask/snaps-jest",
  testMatch: ["**/test/e2e/**/*.e2e.test.js"],
  // A real transfer goes through prepare, sign, execute and then ledger
  // settlement, so the default 5s is far too short.
  testTimeout: 120000,
  testEnvironmentOptions: {
    server: {
      // The Snap's signing key is derived from the Snap ID, and in simulation
      // that ID is local:http://localhost:<port>. snaps-jest picks a random
      // port unless told otherwise, which would give a different Canton party
      // on every run and orphan the party registered by the previous one.
      // Pinning the port keeps one identity across runs.
      port: 8081,
    },
  },
  transform: {
    "^.+\\.js$": "babel-jest",
  },
  transformIgnorePatterns: ["/node_modules/(?!(@metamask/snaps-jest)/)"],
  setupFiles: ["./test/setup.js"],
};
