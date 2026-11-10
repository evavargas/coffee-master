"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { ConfirmButton } from "@/components/recipes/ConfirmButton";
import { RecipeDetail } from "@/components/recipes/RecipeDetail";
import { RecipeForm } from "@/components/recipes/RecipeForm";
import { Button } from "@/components/ui/button";
import { useUserRecipe } from "@/hooks/useUserRecipe";
import { useUserRecipeActions } from "@/hooks/useUserRecipeActions";

export default function MyRecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = use(params);
  const id = /^\d+$/.test(rawId) ? Number(rawId) : NaN;
  const t = useTranslations("myRecipes");
  const tr = useTranslations("recipes");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const { recipe, isLoading, error, notFound } = useUserRecipe(id);
  const actions = useUserRecipeActions(id);

  async function remove() {
    if (await actions.remove()) router.push("/my-recipes");
  }

  const parent = recipe?.parent;

  return (
    <div className="space-y-4">
      <Link href="/my-recipes" className="text-sm underline focus-visible:outline-2 focus-visible:outline-ring">
        {t("back")}
      </Link>
      {!recipe ? (
        <p role={error ? "alert" : "status"} className="text-sm text-muted-foreground">
          {Number.isNaN(id) ? t("invalidId") : notFound ? t("notFound") : (error ?? (isLoading ? t("loading") : null))}
        </p>
      ) : editing ? (
        <RecipeForm recipe={recipe} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />
      ) : (
        <>
          <RecipeDetail recipe={recipe} />
          {parent && (
            <p className="text-sm text-muted-foreground">
              {t("adaptedFrom")}{" "}
              {parent.kind === "catalog" ? (
                <Link href={`/recipes/${encodeURIComponent(String(parent.ref))}`} className="underline">
                  {t("adaptedFromCatalog", { ref: String(parent.ref) })}
                </Link>
              ) : (
                <Link href={`/my-recipes/${parent.ref}`} className="underline">
                  {t("adaptedFromUser")}
                </Link>
              )}
            </p>
          )}
          <section aria-label={tr("actionsLabel")} className="space-y-2">
            <div className="flex flex-wrap items-start gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={actions.isPending}>
                {t("edit")}
              </Button>
              <Button variant="outline" size="sm" aria-pressed={recipe.is_favorite} onClick={actions.toggleFavorite} disabled={actions.isPending}>
                {recipe.is_favorite ? tr("unfavorite") : tr("favorite")}
              </Button>
              <ConfirmButton label={t("delete")} message={t("confirmDelete")} onConfirm={remove} disabled={actions.isPending} />
            </div>
            {actions.error && (
              <p role="alert" className="text-sm text-destructive">
                {actions.error}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
