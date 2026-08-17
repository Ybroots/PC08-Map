module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  moduleNameMapper: {
    "^react-native$": "<rootDir>/test/react-native.mock.cjs",
  },
  collectCoverageFrom: [
    "src/features/sos/**/*.{ts,tsx}",
    "!src/features/sos/styles.ts",
    "!src/features/sos/runtime.ts",
    "!src/features/sos/identifiers.ts",
    "!src/features/sos/connectivity.ts",
    "!src/features/sos/location.ts",
  ],
};
