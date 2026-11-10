import { z } from "zod";

import type { RecipeData } from "@/lib/api/recipes";
import { safeMethod } from "@/lib/api/recipes";
import type { UserRecipe } from "@/lib/api/myRecipes";

// Mirrors the backend RecipeData rules. Messages come from a translate function (never literals).
type Translate = (key: string) => string;

const methods = ["v60", "french_press", "moka", "aeropress", "espresso", "cold_brew", "other"] as const;

const mid = (r: { min?: number; max?: number }) => (r.min === undefined ? undefined : r.max === undefined ? r.min : (r.min + r.max) / 2);

export const buildRecipeFormSchema = (t: Translate) => {
  const num = z.number({ error: t("numberInvalid") }).min(0, t("numberNegative")).optional();

  const range = (bounds?: { min: number; max: number }) =>
    z.object({ min: num, max: num }).superRefine((r, ctx) => {
      if (r.max !== undefined && r.min === undefined) ctx.addIssue({ code: "custom", path: ["min"], message: t("rangeMinRequired") });
      if (r.min !== undefined && r.max !== undefined && r.min > r.max) ctx.addIssue({ code: "custom", path: ["max"], message: t("rangeOrder") });
      if (bounds) {
        for (const key of ["min", "max"] as const) {
          const v = r[key];
          if (v !== undefined && (v < bounds.min || v > bounds.max)) ctx.addIssue({ code: "custom", path: [key], message: t("temperatureRange") });
        }
      }
    });

  return z
    .object({
      name: z.string().trim().min(1, t("nameRequired")).max(120, t("nameMax")),
      description: z.string().max(500, t("descriptionMax")),
      method: z.enum(methods),
      goal: z.enum(["", "sweetness", "balance", "acidity"]),
      coffee: z.object({
        name: z.string().max(120, t("shortTextMax")),
        origin: z.string().max(120, t("shortTextMax")),
        process: z.string().max(120, t("shortTextMax")),
        roast: z.string().max(120, t("shortTextMax")),
        with_milk: z.enum(["", "yes", "no"]),
      }),
      dose_g: range(),
      water_g: range(),
      temperature_c: range({ min: 60, max: 100 }),
      ratio: num,
      grind: z.object({ grinder: z.string().max(120, t("shortTextMax")), description: z.string().max(300, t("grindDescriptionMax")), clicks: range() }),
      brew_time_seconds: range(),
      yield_ml: range(),
      steps: z.array(
        z.object({
          action: z.string().trim().min(1, t("actionRequired")).max(500, t("actionMax")),
          at_seconds: z.number({ error: t("numberInvalid") }).int(t("stepTimeInteger")).min(0, t("numberNegative")).optional(),
          pour_to_g: num,
        }),
      ).max(30, t("stepsMax")),
      notes: z.string().max(2000, t("notesMax")),
    })
    .superRefine((v, ctx) => {
      const add = (path: (string | number)[], key: string) => ctx.addIssue({ code: "custom", path, message: t(key) });
      const waterCap = v.water_g.max ?? v.water_g.min;
      let prevAt: number | undefined;
      let prevPour: number | undefined;
      v.steps.forEach((s, i) => {
        if (s.at_seconds !== undefined) {
          if (prevAt !== undefined && s.at_seconds < prevAt) add(["steps", i, "at_seconds"], "stepTimeOrder");
          prevAt = s.at_seconds;
        }
        if (s.pour_to_g !== undefined) {
          if (prevPour !== undefined && s.pour_to_g < prevPour) add(["steps", i, "pour_to_g"], "stepPourOrder");
          else if (waterCap !== undefined && s.pour_to_g > waterCap) add(["steps", i, "pour_to_g"], "pourAboveWater");
          prevPour = s.pour_to_g;
        }
      });
      const dose = mid(v.dose_g);
      const water = mid(v.water_g);
      if (v.ratio !== undefined && dose !== undefined && water !== undefined) {
        if (dose <= 0) add(["dose_g", "min"], "dosePositive");
        else if (Math.abs(v.ratio - water / dose) > 0.05 * (water / dose)) add(["ratio"], "ratioMismatch");
      }
    });
};

export type RecipeFormValues = z.infer<ReturnType<typeof buildRecipeFormSchema>>;

const toRange = (r: { min?: number | null; max?: number | null } | null | undefined) => ({ min: r?.min ?? undefined, max: r?.max ?? undefined });
const milk = (v: boolean | null | undefined) => (v == null ? "" : v ? "yes" : "no");

export function toFormValues(r: UserRecipe): RecipeFormValues {
  return {
    name: r.name,
    description: r.description ?? "",
    method: safeMethod(r.method),
    goal: r.goal ?? "",
    coffee: { name: r.coffee?.name ?? "", origin: r.coffee?.origin ?? "", process: r.coffee?.process ?? "", roast: r.coffee?.roast ?? "", with_milk: milk(r.coffee?.with_milk) },
    dose_g: toRange(r.dose_g),
    water_g: toRange(r.water_g),
    temperature_c: toRange(r.temperature_c),
    ratio: r.ratio ?? undefined,
    grind: { grinder: r.grind?.grinder ?? "", description: r.grind?.description ?? "", clicks: toRange(r.grind?.clicks) },
    brew_time_seconds: toRange(r.brew_time_seconds),
    yield_ml: toRange(r.yield_ml),
    steps: (r.steps ?? []).map((s) => ({ action: s.action, at_seconds: s.at_seconds ?? undefined, pour_to_g: s.pour_to_g ?? undefined })),
    notes: r.notes ?? "",
  };
}

const text = (s: string) => s.trim() || undefined;
const fromRange = (r: { min?: number; max?: number }) => (r.min === undefined ? undefined : { min: r.min, ...(r.max !== undefined ? { max: r.max } : {}) });
const compact = <T extends object>(o: T) => (Object.values(o).some((v) => v !== undefined) ? o : undefined);

/** Full RecipeData for the PUT: empty text and empty ranges are omitted, never sent as "". */
export function toRecipeData(v: RecipeFormValues): RecipeData {
  return {
    name: v.name.trim(),
    method: v.method,
    description: text(v.description),
    goal: v.goal || undefined,
    coffee: compact({
      name: text(v.coffee.name),
      origin: text(v.coffee.origin),
      process: text(v.coffee.process),
      roast: text(v.coffee.roast),
      with_milk: v.coffee.with_milk ? v.coffee.with_milk === "yes" : undefined,
    }),
    dose_g: fromRange(v.dose_g),
    water_g: fromRange(v.water_g),
    temperature_c: fromRange(v.temperature_c),
    ratio: v.ratio,
    grind: compact({ grinder: text(v.grind.grinder), description: text(v.grind.description), clicks: fromRange(v.grind.clicks) }),
    brew_time_seconds: fromRange(v.brew_time_seconds),
    yield_ml: fromRange(v.yield_ml),
    steps: v.steps.map((s) => ({ action: s.action.trim(), at_seconds: s.at_seconds, pour_to_g: s.pour_to_g })),
    notes: text(v.notes),
  };
}
