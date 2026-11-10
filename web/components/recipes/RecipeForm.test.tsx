import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecipeForm } from "@/components/recipes/RecipeForm";
import { updateUserRecipe } from "@/lib/api/myRecipes";
import { clearUserRecipeStore, getCachedUserRecipe, lockUserRecipe } from "@/lib/userRecipeStore";
import es from "@/messages/es.json";
import { makeUserRecipe } from "@/test/recipeFixtures";

vi.mock("@/lib/api/myRecipes", async (orig) => ({ ...(await orig<typeof import("@/lib/api/myRecipes")>()), updateUserRecipe: vi.fn() }));

const onSaved = vi.fn();
const wrap = (recipe = makeUserRecipe(1)) =>
  render(
    <NextIntlClientProvider locale="es" messages={es}>
      <RecipeForm recipe={recipe} onSaved={onSaved} onCancel={() => {}} />
    </NextIntlClientProvider>,
  );

describe("RecipeForm", () => {
  afterEach(cleanup);
  beforeEach(() => {
    clearUserRecipeStore();
    onSaved.mockReset();
    vi.mocked(updateUserRecipe).mockReset().mockImplementation(async (id, r) => makeUserRecipe(id, { name: r.name }));
  });

  it("renders existing values and does not crash with every optional field missing", () => {
    wrap(makeUserRecipe(1, { name: "Mi V60", coffee: { name: "Etiopía" }, grind: null, steps: undefined, notes: null, ratio: null, dose_g: { min: 15 } }));
    expect(screen.getByLabelText("Nombre")).toHaveValue("Mi V60");
    expect(screen.getByLabelText("Café")).toHaveValue("Etiopía");
    expect(screen.getByLabelText("Dosis mín.")).toHaveValue(15);
  });

  it("shows validation errors and does not submit", async () => {
    wrap();
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText("Ingresá un nombre")).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveAttribute("aria-invalid", "true");
    expect(updateUserRecipe).not.toHaveBeenCalled();
  });

  it("adds and removes step rows", () => {
    wrap();
    fireEvent.click(screen.getByRole("button", { name: "Agregar paso" }));
    expect(screen.getByLabelText("Acción del paso 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quitar paso 1" }));
    expect(screen.queryByLabelText("Acción del paso 1")).not.toBeInTheDocument();
  });

  it("submits the full recipe once and updates the cache", async () => {
    wrap();
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Nuevo nombre" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(updateUserRecipe).toHaveBeenCalledTimes(1);
    expect(updateUserRecipe).toHaveBeenCalledWith(1, expect.objectContaining({ name: "Nuevo nombre", method: "v60" }));
    expect(getCachedUserRecipe(1)?.name).toBe("Nuevo nombre");
  });

  it("maps a server 422 to the field and a general message", async () => {
    const err = Object.assign(new Error("422"), { isAxiosError: true, response: { status: 422, data: { detail: [{ loc: ["body", "name"], msg: "nombre repetido", type: "x" }] } } });
    vi.mocked(updateUserRecipe).mockRejectedValue(err);
    wrap();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText("nombre repetido")).toBeInTheDocument();
    expect(screen.getByText(es.myRecipes.form.serverError)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  const reject422 = (detail: unknown) =>
    vi.mocked(updateUserRecipe).mockRejectedValue(Object.assign(new Error("422"), { isAxiosError: true, response: { status: 422, data: { detail } } }));

  it("shows model-level 422 messages under a Spanish prefix", async () => {
    reject422([{ loc: ["body"], msg: "Value error, ratio mismatch", type: "value_error" }]);
    wrap();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText(/El servidor rechazó la receta: .*ratio mismatch/)).toBeInTheDocument();
  });

  it("maps a range-level 422 to the min field", async () => {
    reject422([{ loc: ["body", "dose_g"], msg: "bad range", type: "value_error" }]);
    wrap();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText("bad range")).toBeInTheDocument();
    expect(screen.getByLabelText("Dosis mín.")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows feedback when another mutation holds the lock", async () => {
    lockUserRecipe(1);
    wrap();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText(es.myRecipes.form.busy)).toBeInTheDocument();
    expect(updateUserRecipe).not.toHaveBeenCalled();
  });
});
