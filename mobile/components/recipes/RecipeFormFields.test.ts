import { describe, expect, it, jest } from "@jest/globals";

import { toNumber } from "@/components/recipes/RecipeFormFields";

jest.mock("@/context/ThemeContext", () => ({ useAppTheme: () => ({ colors: {} }) }));

describe("toNumber", () => {
  it("parses plain decimals, with a dot or a comma", () => {
    expect(toNumber("1,5")).toBe(1.5);
    expect(toNumber("1.")).toBe(1);
    expect(toNumber(" 12.25 ")).toBe(12.25);
  });
  it("treats empty text as not set", () => {
    expect(toNumber("")).toBeUndefined();
    expect(toNumber("  ")).toBeUndefined();
  });
  it.each(["abc", "1e3", "0x10", "Infinity", "1,5.2", "-1", "."])("rejects %s as NaN", (text) => {
    expect(toNumber(text)).toBeNaN();
  });
});
