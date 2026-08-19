module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/features"],
  testRegex: ".*\\.spec\\.ts$",
  collectCoverageFrom: ["features/**/*.ts", "!features/**/*.spec.ts"],
};
