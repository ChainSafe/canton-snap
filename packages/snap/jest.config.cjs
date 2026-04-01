/** @type {import('jest').Config} */
module.exports = {
  preset: "@metamask/snaps-jest",
  testMatch: ["**/test/**/*.test.js"],
  testTimeout: 15000,
  transform: {
    "^.+\\.js$": "babel-jest",
  },
  transformIgnorePatterns: [
    "/node_modules/(?!(@metamask/snaps-jest)/)",
  ],
  setupFiles: ["./test/setup.js"],
};
