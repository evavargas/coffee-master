"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { MyRecipeRow } from "@/components/recipes/MyRecipeRow";
import { MyRecipesTabs } from "@/components/recipes/MyRecipesTabs";
import { Button } from "@/components/ui/button";
import { useMyRecipes } from "@/hooks/useMyRecipes";
import type { MyRecipeFilter } from "@/lib/api/myRecipes";

export default function MyRecipesPage() {
  const t = useTranslations("myRecipes");
  const tr = useTranslations("recipes");
  const [filter, setFilter] = useState<MyRecipeFilter>("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const { items, isLoading, isLoadingMore, error, hasMore, loadMore, retry } = useMyRecipes(filter);

  return (
    <div className="space-y-4 pb-4">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <MyRecipesTabs
        value={filter}
        onChange={(f) => {
          setActionError(null);
          setFilter(f);
        }}
      />
      <div aria-live="polite">
        {isLoading && <p role="status" className="text-sm text-muted-foreground">{t("loading")}</p>}
        {error && (
          <div role="alert" className="space-y-2 text-sm text-destructive">
            <p>{error}</p>
            <Button variant="outline" size="sm" onClick={retry}>{tr("retry")}</Button>
          </div>
        )}
        {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
        {!isLoading && !error && items.length === 0 && <p className="text-sm text-muted-foreground">{t(`empty.${filter}`)}</p>}
      </div>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.kind === "catalog" ? `c:${item.recipe.slug}` : `u:${item.recipe.id}`}>
            <MyRecipeRow item={item} onError={setActionError} />
          </li>
        ))}
      </ul>
      {hasMore && !isLoading && (
        <Button variant="outline" onClick={loadMore} disabled={isLoadingMore}>
          {isLoadingMore ? t("loading") : tr("loadMore")}
        </Button>
      )}
    </div>
  );
}
