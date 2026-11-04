import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownMessage } from "@/components/chat/MarkdownMessage";

describe("MarkdownMessage", () => {
  it("renders bold text and lists from Markdown", () => {
    render(<MarkdownMessage content={"**Dosis**: 18 g\n\n- uno\n- dos"} />);
    expect(screen.getByText("Dosis").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders GFM tables", () => {
    render(<MarkdownMessage content={"| Método | Ratio |\n| --- | --- |\n| V60 | 1:15 |"} />);
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("1:15")).toBeTruthy();
  });

  it("never injects raw HTML from the model into the page", () => {
    const { container } = render(<MarkdownMessage content={'Hola <img src=x onerror="alert(1)"> <script>alert(1)</script>'} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });
});
