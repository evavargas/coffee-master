"use client";

import { useTranslations } from "next-intl";

import { useRecipeRefName } from "@/hooks/useRecipeRefName";
import type { RecipeRef } from "@/lib/api/chat";

/** "Talking about X" note; falls back to generic copy while or when the name cannot be resolved. */
export function RecipeBanner({ recipeRef }: { recipeRef: RecipeRef }) {
  const t = useTranslations("chat");
  const { name } = useRecipeRefName(recipeRef);
  return (
    <p role="note" className="shrink-0 rounded-lg border border-border bg-muted px-3 py-2 text-sm">
      {name ? t("talkingAbout", { name }) : t("talkingAboutGeneric")}
    </p>
  );
}
