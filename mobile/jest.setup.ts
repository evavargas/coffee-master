// Jest setup for the whole mobile test suite.
// AsyncStorage's native module is unavailable under Jest, so every test run
// uses the package's official mock instead (see i18n/index.ts, which persists
// the locale via AsyncStorage).
import { jest } from "@jest/globals";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
