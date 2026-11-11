import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecipeFilters } from "@/components/recipes/RecipeFilters";
import es from "@/messages/es.json";

const renderFilters = (method: "moka" | undefined, onMethod = vi.fn(), onQ = vi.fn()) =>
  render(
    <NextIntlClientProvider locale="es" messages={es}>
      <RecipeFilters q="" method={method} onQChange={onQ} onMethodChange={onMethod} />
    </NextIntlClientProvider>,
  );
const choose = (name: string) => {
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Método" }), { key: "Enter" });
  fireEvent.click(screen.getByRole("option", { name }));
};

describe("RecipeFilters", () => {
  afterEach(cleanup);

  it("reports search text changes", () => {
    const onQ = vi.fn();
    renderFilters(undefined, vi.fn(), onQ);
    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "etiopia" } });
    expect(onQ).toHaveBeenCalledWith("etiopia");
  });

  it("uses the themed select (not the native one) and reports the chosen method, and none for 'all'", () => {
    const onMethod = vi.fn();
    const { container } = renderFilters(undefined, onMethod);
    expect(container.querySelector("select")).toBeNull();
    choose("Moka");
    expect(onMethod).toHaveBeenCalledWith("moka");
    cleanup();

    const again = vi.fn();
    renderFilters("moka", again);
    expect(screen.getByRole("combobox", { name: "Método" })).toHaveTextContent("Moka");
    choose("Todos los métodos");
    expect(again).toHaveBeenLastCalledWith(undefined);
  });
});
