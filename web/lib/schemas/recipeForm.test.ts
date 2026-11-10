import { describe, expect, it } from "vitest";

import { buildRecipeFormSchema, toFormValues, toRecipeData, type RecipeFormValues } from "@/lib/schemas/recipeForm";
import { makeUserRecipe } from "@/test/recipeFixtures";

// Keys echo back so assertions don't depend on copy.
const schema = buildRecipeFormSchema((key) => key);

const base = (extra: Partial<RecipeFormValues> = {}): RecipeFormValues => ({ ...toFormValues(makeUserRecipe(1)), ...extra });
const issues = (values: RecipeFormValues) => {
  const r = schema.safeParse(values);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}:${i.message}`);
};

describe("recipe form schema", () => {
  it("accepts a minimal and a complete recipe", () => {
    expect(issues(base())).toEqual([]);
    expect(
      issues(
        base({
          dose_g: { min: 15 },
          water_g: { min: 250, max: 260 },
          ratio: 16.8,
          temperature_c: { min: 92, max: 96 },
          steps: [
            { action: "a", at_seconds: 0, pour_to_g: 50 },
            { action: "b", at_seconds: 30, pour_to_g: 250 },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("requires a name of 1..120 chars and a description up to 500", () => {
    expect(issues(base({ name: "  " }))).toContain("name:nameRequired");
    expect(issues(base({ name: "x".repeat(121) }))).toContain("name:nameMax");
    expect(issues(base({ name: "x".repeat(120) }))).toEqual([]);
    expect(issues(base({ description: "x".repeat(501) }))).toContain("description:descriptionMax");
    expect(issues(base({ description: "x".repeat(500) }))).toEqual([]);
  });

  it("keeps temperature within 60..100", () => {
    expect(issues(base({ temperature_c: { min: 59 } }))).toContain("temperature_c.min:temperatureRange");
    expect(issues(base({ temperature_c: { min: 90, max: 101 } }))).toContain("temperature_c.max:temperatureRange");
    expect(issues(base({ temperature_c: { min: 60, max: 100 } }))).toEqual([]);
  });

  it("enforces the backend text limits", () => {
    const v = base();
    const longA = "x".repeat(501);
    expect(issues({ ...v, notes: "x".repeat(2001) })).toContain("notes:notesMax");
    expect(issues({ ...v, notes: "x".repeat(2000) })).toEqual([]);
    expect(issues({ ...v, coffee: { ...v.coffee, origin: "x".repeat(121) } })).toContain("coffee.origin:shortTextMax");
    expect(issues({ ...v, grind: { ...v.grind, grinder: "x".repeat(121) } })).toContain("grind.grinder:shortTextMax");
    expect(issues({ ...v, grind: { ...v.grind, description: "x".repeat(301) } })).toContain("grind.description:grindDescriptionMax");
    expect(issues({ ...v, steps: [{ action: longA }] })).toContain("steps.0.action:actionMax");
    const step = { action: "a" };
    expect(issues({ ...v, steps: Array(31).fill(step) })).toContain("steps:stepsMax");
    expect(issues({ ...v, steps: Array(30).fill(step) })).toEqual([]);
  });

  it("requires ranges to have min and min <= max", () => {
    expect(issues(base({ dose_g: { max: 10 } }))).toContain("dose_g.min:rangeMinRequired");
    expect(issues(base({ water_g: { min: 300, max: 200 } }))).toContain("water_g.max:rangeOrder");
    expect(issues(base({ dose_g: { min: 15, max: 15 } }))).toEqual([]);
  });

  it("requires non-decreasing step times and pours", () => {
    const steps = [
      { action: "a", at_seconds: 30, pour_to_g: 100 },
      { action: "b", at_seconds: 10, pour_to_g: 50 },
    ];
    const found = issues(base({ steps }));
    expect(found).toContain("steps.1.at_seconds:stepTimeOrder");
    expect(found).toContain("steps.1.pour_to_g:stepPourOrder");
    expect(issues(base({ steps: [{ action: "a", at_seconds: 5 }, { action: "b" }, { action: "c", at_seconds: 5 }] }))).toEqual([]);
    expect(issues(base({ steps: [{ action: "" }] }))).toContain("steps.0.action:actionRequired");
  });

  it("does not allow pouring above the maximum water", () => {
    const steps = [{ action: "a", pour_to_g: 260 }];
    expect(issues(base({ water_g: { min: 240, max: 250 }, steps }))).toContain("steps.0.pour_to_g:pourAboveWater");
    expect(issues(base({ water_g: { min: 240, max: 260 }, steps }))).toEqual([]);
  });

  it("keeps the ratio within 5% of water/dose when all three exist", () => {
    const v = { dose_g: { min: 15 }, water_g: { min: 250 } };
    expect(issues(base({ ...v, ratio: 20 }))).toContain("ratio:ratioMismatch");
    expect(issues(base({ ...v, ratio: 16.7 }))).toEqual([]);
    expect(issues(base({ dose_g: { min: 15 }, ratio: 20 }))).toEqual([]);
  });

  it("requires integer step seconds", () => {
    expect(issues(base({ steps: [{ action: "a", at_seconds: 1.5 }] }))).toContain("steps.0.at_seconds:stepTimeInteger");
    expect(issues(base({ steps: [{ action: "a", at_seconds: 2 }] }))).toEqual([]);
  });

  it("rejects a zero dose when ratio, dose and water exist", () => {
    expect(issues(base({ dose_g: { min: 0 }, water_g: { min: 250 }, ratio: 16 }))).toContain("dose_g.min:dosePositive");
  });

  it("rejects NaN numbers", () => {
    expect(issues(base({ ratio: NaN }))).toContain("ratio:numberInvalid");
  });
});

describe("recipe form mapping", () => {
  it("round-trips sparse recipes without empty fields", () => {
    const data = toRecipeData(base({ name: " Mi V60 ", coffee: { name: "", origin: "", process: "", roast: "", with_milk: "" } }));
    expect(data).toEqual({ name: "Mi V60", method: "v60", steps: [] });
  });

  it("keeps filled values", () => {
    const recipe = makeUserRecipe(2, { coffee: { name: "Etiopía", with_milk: false }, dose_g: { min: 15, max: 16 }, steps: [{ action: "Verter", pour_to_g: 50 }] });
    const data = toRecipeData(toFormValues(recipe));
    expect(data).toMatchObject({ coffee: { name: "Etiopía", with_milk: false }, dose_g: { min: 15, max: 16 }, steps: [{ action: "Verter", pour_to_g: 50 }] });
  });
});
