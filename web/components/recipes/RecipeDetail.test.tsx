import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import { RecipeDetail } from "@/components/recipes/RecipeDetail";
import es from "@/messages/es.json";
import { makeRecipe } from "@/test/recipeFixtures";

const wrap = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="es" messages={es}>{ui}</NextIntlClientProvider>);

describe("RecipeDetail", () => {
  it("renders with every optional field missing", () => {
    wrap(<RecipeDetail recipe={makeRecipe("a", { coffee: null, grind: null, steps: undefined, notes: null, ratio: null, water_g: null })} />);
    expect(screen.getByRole("heading", { name: "Receta a" })).toBeInTheDocument();
    expect(screen.queryByText("Pasos")).not.toBeInTheDocument();
  });

  it("renders sparse nested objects and ranges", () => {
    wrap(
      <RecipeDetail
        recipe={makeRecipe("a", {
          coffee: { name: "Etiopía" },
          grind: { clicks: { min: 20, max: 24 } },
          temperature_c: { min: 93 },
          steps: [{ action: "Verter", pour_to_g: 60 }, { action: "Esperar" }],
          archived: true,
        })}
      />,
    );
    expect(screen.getByText("20–24")).toBeInTheDocument();
    expect(screen.getByText("93 °C")).toBeInTheDocument();
    expect(screen.getByText("Hasta 60 g de agua")).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
  });

  it("uses aria-pressed on the favorite toggle", () => {
    const noop = () => {};
    wrap(<RecipeDetail recipe={makeRecipe("a", { is_favorite: true })} actions={{ isPending: false, error: null, save: noop, remove: noop, toggleFavorite: noop, ask: noop, adapt: noop }} />);
    expect(screen.getByRole("button", { name: "Quitar de favoritas" })).toHaveAttribute("aria-pressed", "true");
  });
});
