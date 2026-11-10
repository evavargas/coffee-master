"use client";

import { use } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { RecipeDetail } from "@/components/recipes/RecipeDetail";
import { useRecipe } from "@/hooks/useRecipe";
import { useRecipeLibrary } from "@/hooks/useRecipeLibrary";

export default function RecipeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const t = useTranslations("recipes");
  const { recipe, isLoading, error, notFound } = useRecipe(slug);
  const actions = useRecipeLibrary(slug);

  return (
    <div className="space-y-4">
      <Link href="/recipes" className="text-sm underline focus-visible:outline-2 focus-visible:outline-ring">
        {t("back")}
      </Link>
      {recipe ? (
        <RecipeDetail recipe={recipe} actions={actions} />
      ) : (
        <p role={error ? "alert" : "status"} className="text-sm text-muted-foreground">
          {notFound ? t("notFound") : (error ?? (isLoading ? t("loading") : null))}
        </p>
      )}
    </div>
  );
}
