import { z } from "zod";

import type { UserRecipe } from "@/lib/api/myRecipes";
import type { CatalogRecipe } from "@/lib/api/recipes";

/** Only the fields the UI dereferences are required; everything else passes through untouched. */
const stepSchema = z.object({ action: z.string() }).passthrough();

export const catalogRecipeSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    method: z.string(),
    is_saved: z.boolean(),
    is_favorite: z.boolean(),
    steps: z.array(stepSchema).nullish(),
  })
  .passthrough();

export const recipeListSchema = z.object({
  items: z.array(z.unknown()),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export const conversationCreatedSchema = z.object({ id: z.number().int() }).passthrough();

const userRecipeShape = z
  .object({
    id: z.number().int(),
    name: z.string(),
    method: z.string(),
    is_favorite: z.boolean(),
    steps: z.array(stepSchema).nullish(),
  })
  .passthrough();

export const myRecipeEnvelopeSchema = z.object({ kind: z.enum(["catalog", "user"]), recipe: z.unknown() });

/** Typed validators: the checked shape is the generated type, so callers need no casts. */
export const userRecipeSchema = z.custom<UserRecipe>((v) => userRecipeShape.safeParse(v).success);
export const catalogItemSchema = z.custom<CatalogRecipe>((v) => catalogRecipeSchema.safeParse(v).success);
