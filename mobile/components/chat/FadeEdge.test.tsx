import { render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { StyleSheet } from "react-native";

import { FadeEdge } from "@/components/chat/FadeEdge";

jest.mock("@/context/ThemeContext", () => ({ useAppTheme: () => ({ colors: { background: "#2a1a18" } }) }));

const alphas = async (edge: "top" | "bottom") => {
  await render(<FadeEdge edge={edge} />);
  return screen.getAllByTestId("fade-strip").map((s) => Number(/, ([\d.]+)\)$/.exec(String(StyleSheet.flatten(s.props.style).backgroundColor))?.[1]));
};

describe("FadeEdge", () => {
  it("fades the background in toward the bottom edge", async () => {
    const a = await alphas("bottom");
    expect(a).toHaveLength(10);
    expect(a).toEqual([...a].sort((x, y) => x - y));
    expect(a[0]).toBeLessThan(0.1);
    expect(a[a.length - 1]).toBeGreaterThan(0.9);
  });
  it("fades the other way at the top edge", async () => {
    const a = await alphas("top");
    expect(a).toEqual([...a].sort((x, y) => y - x));
    expect(a[0]).toBeGreaterThan(0.9);
  });
});
