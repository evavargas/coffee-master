import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import "@/i18n";
import { RecipeForm } from "@/components/recipes/RecipeForm";
import { updateUserRecipe } from "@/lib/api/myRecipes";
import { clearUserRecipeStore, getCachedUserRecipe, lockUserRecipe } from "@/lib/userRecipeStore";
import es from "@/i18n/locales/es.json";
import { makeUserRecipe } from "@/test/recipeFixtures";

jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock("lucide-react-native", () => ({ Eye: () => null, EyeOff: () => null }));
jest.mock("@/context/ThemeContext", () => ({
  useAppTheme: () => ({ colors: new Proxy({}, { get: (_t, name) => `theme-${String(name)}` }) }),
}));
jest.mock("@/lib/api/myRecipes", () => ({ ...jest.requireActual<typeof import("@/lib/api/myRecipes")>("@/lib/api/myRecipes"), updateUserRecipe: jest.fn() }));

const mUpdate = updateUserRecipe as jest.MockedFunction<typeof updateUserRecipe>;
const onSaved = jest.fn();
const wrap = (recipe = makeUserRecipe(1)) => render(<RecipeForm recipe={recipe} onSaved={onSaved} onCancel={() => {}} />);
const save = () => fireEvent.press(screen.getByRole("button", { name: "Guardar cambios" }));
const reject422 = (detail: unknown) =>
  mUpdate.mockRejectedValue(Object.assign(new Error("422"), { isAxiosError: true, response: { status: 422, data: { detail } } }));

describe("RecipeForm", () => {
  beforeEach(() => {
    clearUserRecipeStore();
    onSaved.mockReset();
    mUpdate.mockReset().mockImplementation(async (id, r) => makeUserRecipe(id, { name: r.name }));
  });

  it("renders existing values and does not crash with every optional field missing", async () => {
    await wrap(makeUserRecipe(1, { name: "Mi V60", coffee: { name: "Etiopía" }, grind: null, steps: undefined, notes: null, ratio: null, dose_g: { min: 15 } }));
    expect(screen.getByLabelText("Nombre").props.value).toBe("Mi V60");
    expect(screen.getByLabelText("Café").props.value).toBe("Etiopía");
    expect(screen.getByLabelText("Dosis mín.").props.value).toBe("15");
  });

  it("uses numeric keyboards, an integer pad for step seconds", async () => {
    await wrap(makeUserRecipe(1, { steps: [{ action: "Verter" }] }));
    expect(screen.getByLabelText("Dosis mín.").props.keyboardType).toBe("decimal-pad");
    expect(screen.getByLabelText("Segundo del paso 1").props.keyboardType).toBe("number-pad");
  });

  it("shows validation errors and does not submit", async () => {
    await wrap();
    await fireEvent.changeText(screen.getByLabelText("Nombre"), "");
    await save();
    expect(await screen.findByText("Ingresá un nombre")).toBeTruthy();
    expect(mUpdate).not.toHaveBeenCalled();
  });

  it("reports unparsable numbers instead of sending them", async () => {
    await wrap();
    await fireEvent.changeText(screen.getByLabelText("Proporción"), "abc");
    await save();
    expect(await screen.findByText("Ingresá un número válido")).toBeTruthy();
    expect(mUpdate).not.toHaveBeenCalled();
  });

  it("adds and removes step rows", async () => {
    await wrap();
    await fireEvent.press(screen.getByRole("button", { name: "Agregar paso" }));
    expect(screen.getByLabelText("Acción del paso 1")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Quitar paso 1" }));
    expect(screen.queryByLabelText("Acción del paso 1")).toBeNull();
  });

  it("submits the full recipe once and updates the cache", async () => {
    await wrap();
    await fireEvent.changeText(screen.getByLabelText("Nombre"), "Nuevo nombre");
    await save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mUpdate).toHaveBeenCalledTimes(1);
    expect(mUpdate).toHaveBeenCalledWith(1, expect.objectContaining({ name: "Nuevo nombre", method: "v60" }));
    expect(getCachedUserRecipe(1)?.name).toBe("Nuevo nombre");
  });

  it("maps a server 422 to the field and a general message", async () => {
    reject422([{ loc: ["body", "name"], msg: "nombre repetido", type: "x" }]);
    await wrap();
    await save();
    expect(await screen.findByText("nombre repetido")).toBeTruthy();
    expect(screen.getByText(es.myRecipes.form.serverError)).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("shows model-level 422 messages under a Spanish prefix", async () => {
    reject422([{ loc: ["body"], msg: "Value error, ratio mismatch", type: "value_error" }]);
    await wrap();
    await save();
    expect(await screen.findByText(/El servidor rechazó la receta: .*ratio mismatch/)).toBeTruthy();
  });

  it("maps a range-level 422 to the min field", async () => {
    reject422([{ loc: ["body", "dose_g"], msg: "bad range", type: "value_error" }]);
    await wrap();
    await save();
    expect(await screen.findByText("bad range")).toBeTruthy();
  });

  it("shows feedback when another mutation holds the lock", async () => {
    lockUserRecipe(1);
    await wrap();
    await save();
    expect(await screen.findByText(es.myRecipes.form.busy)).toBeTruthy();
    expect(mUpdate).not.toHaveBeenCalled();
  });
});
