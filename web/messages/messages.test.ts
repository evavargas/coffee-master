import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import es from "@/messages/es.json";

function keys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) => (typeof v === "object" && v ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
}

describe("messages", () => {
  it("es and en have exactly the same keys", () => {
    expect(keys(en).sort()).toEqual(keys(es).sort());
  });

  it("has the nav labels in both locales", () => {
    expect(es.nav).toMatchObject({ chat: "Chat", recipes: "Recetas", myRecipes: "Mis recetas", signOut: "Cerrar sesión" });
    expect(en.nav).toMatchObject({ ariaLabel: "Main navigation", chat: "Chat", recipes: "Recipes", myRecipes: "My recipes", signOut: "Sign out" });
  });

  it("has the recipes page title in both locales", () => {
    expect(es.recipes.title).toBe("Recetas sugeridas por Coffee Master");
    expect(en.recipes.title).toBe("Recipes suggested by Coffee Master");
  });
});
