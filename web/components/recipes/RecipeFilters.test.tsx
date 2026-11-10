import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { RecipeFilters } from "@/components/recipes/RecipeFilters";
import es from "@/messages/es.json";

describe("RecipeFilters", () => {
  it("reports search text and method changes", () => {
    const onQ = vi.fn();
    const onMethod = vi.fn();
    render(
      <NextIntlClientProvider locale="es" messages={es}>
        <RecipeFilters q="" method={undefined} onQChange={onQ} onMethodChange={onMethod} />
      </NextIntlClientProvider>,
    );
    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "etiopia" } });
    expect(onQ).toHaveBeenCalledWith("etiopia");
    fireEvent.change(screen.getByLabelText("Método"), { target: { value: "moka" } });
    expect(onMethod).toHaveBeenCalledWith("moka");
    fireEvent.change(screen.getByLabelText("Método"), { target: { value: "" } });
    expect(onMethod).toHaveBeenLastCalledWith(undefined);
  });
});
