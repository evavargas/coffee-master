import { describe, expect, it } from "@jest/globals";

import { withAlpha } from "@/lib/color";

describe("withAlpha", () => {
  it("turns a hex color into rgba", () => {
    expect(withAlpha("#fffff0", 0.5)).toBe("rgba(255, 255, 240, 0.5)");
    expect(withAlpha("#2A1A18", 1)).toBe("rgba(42, 26, 24, 1)");
  });
  it("leaves other formats alone", () => {
    expect(withAlpha("rgba(0, 0, 0, 0.4)", 0.5)).toBe("rgba(0, 0, 0, 0.4)");
    expect(withAlpha("tomato", 0.5)).toBe("tomato");
  });
});
