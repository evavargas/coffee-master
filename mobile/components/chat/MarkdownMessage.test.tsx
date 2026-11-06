import { render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import { MarkdownMessage } from "@/components/chat/MarkdownMessage";

// Uses the real react-native-markdown-display, so it also covers the markdown-it version it runs on.
jest.mock("@/context/ThemeContext", () => ({
  useAppTheme: () => ({
    colors: new Proxy({}, { get: (_target, name) => `theme-${String(name)}` }),
  }),
}));

const reply = [
  "## Receta",
  "",
  "Usá **15 g** de café y `250 ml` de agua.",
  "",
  "- Moler medio",
  "- Verter en círculos",
  "",
  "1. Precalentar",
  "2. Servir",
  "",
  "| Método | Ratio |",
  "| --- | --- |",
  "| V60 | 1:16 |",
  "",
  "Más info en [la guía](https://example.com)",
].join("\n");

describe("MarkdownMessage", () => {
  it("renders headings, emphasis, code, lists, tables and links", async () => {
    await render(<MarkdownMessage content={reply} />);

    expect(screen.getByText("Receta")).toBeTruthy();
    expect(screen.getByText("15 g")).toBeTruthy();
    expect(screen.getByText("250 ml")).toBeTruthy();
    expect(screen.getByText("Moler medio")).toBeTruthy();
    expect(screen.getByText("Servir")).toBeTruthy();
    expect(screen.getByText("V60")).toBeTruthy();
    expect(screen.getByText("1:16")).toBeTruthy();
    expect(screen.getByText("la guía")).toBeTruthy();
  });

  it("shows raw HTML as text instead of rendering it", async () => {
    await render(<MarkdownMessage content={"<b>hola</b>"} />);

    expect(screen.getByText("<b>hola</b>")).toBeTruthy();
  });

  it("handles long adversarial input quickly", async () => {
    const hostile = "'".repeat(20000) + " mailto:" + "a".repeat(20000);
    const start = Date.now();
    await render(<MarkdownMessage content={hostile} />);
    expect(Date.now() - start).toBeLessThan(5000);
  });
});
