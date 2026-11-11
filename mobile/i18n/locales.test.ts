import { describe, expect, it } from "@jest/globals";

import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";

function keys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("locales", () => {
  it("es and en have exactly the same keys", () => {
    expect(keys(en).sort()).toEqual(keys(es).sort());
  });
  it("defines the nav labels in both locales", () => {
    for (const nav of [es.nav, en.nav]) {
      expect(Object.keys(nav).sort()).toEqual(["chat", "menu", "myRecipes", "recents", "recipes", "signOut"]);
    }
    expect(es.nav.signOut).toBe("Cerrar sesión");
  });
  it("titles the recipes screen", () => {
    expect(es.recipes.title).toBe("Recetas sugeridas por Coffee Master");
    expect(en.recipes.title).toBe("Recipes suggested by Coffee Master");
  });
});
