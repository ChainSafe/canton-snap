/** @type {import('jest').Config} */
module.exports = {
  preset: "@metamask/snaps-jest",
  testMatch: ["**/test/**/*.test.js"],
  // End-to-end tests need a reachable middleware and run via
  // jest.e2e.config.cjs (npm run test:e2e), not as part of the default suite.
  testPathIgnorePatterns: ["/node_modules/", "/test/e2e/"],
  testTimeout: 15000,
  transform: {
    "^.+\\.js$": "babel-jest",
  },
  transformIgnorePatterns: [
    "/node_modules/(?!(@metamask/snaps-jest)/)",
  ],
  setupFiles: ["./test/setup.js"],
};
