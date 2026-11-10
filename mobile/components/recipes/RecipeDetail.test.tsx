import { render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import "@/i18n";
import { RecipeDetail } from "@/components/recipes/RecipeDetail";
import { makeRecipe } from "@/test/recipeFixtures";

jest.mock("@/context/ThemeContext", () => ({
  useAppTheme: () => ({ colors: new Proxy({}, { get: (_t, name) => `theme-${String(name)}` }) }),
}));

describe("RecipeDetail", () => {
  it("renders with every optional field missing", async () => {
    await render(<RecipeDetail recipe={makeRecipe("a", { coffee: null, grind: null, steps: undefined, notes: null, ratio: null, water_g: null })} />);
    expect(screen.getByText("Receta a")).toBeTruthy();
    expect(screen.queryByText("Pasos")).toBeNull();
  });

  it("renders sparse nested objects, ranges and the archived notice", async () => {
    await render(
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
    expect(screen.getByText("20–24")).toBeTruthy();
    expect(screen.getByText("93 °C")).toBeTruthy();
    expect(screen.getByText("Hasta 60 g de agua")).toBeTruthy();
    expect(screen.getByText(/archivada/)).toBeTruthy();
  });

  it("marks the favorite toggle as selected", async () => {
    const noop = () => {};
    await render(
      <RecipeDetail
        recipe={makeRecipe("a", { is_favorite: true })}
        actions={{ isPending: false, error: null, save: noop, remove: noop, toggleFavorite: noop, ask: noop, adapt: noop }}
      />,
    );
    expect(screen.getByRole("button", { name: "Quitar de favoritas" })).toBeTruthy();
  });
});
