"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { RecipeCard } from "@/components/recipes/RecipeCard";
import { RecipeFilters } from "@/components/recipes/RecipeFilters";
import { Button } from "@/components/ui/button";
import { useRecipes } from "@/hooks/useRecipes";
import type { RecipeMethod } from "@/lib/api/recipes";

export default function RecipesPage() {
  const t = useTranslations("recipes");
  const [q, setQ] = useState("");
  const [method, setMethod] = useState<RecipeMethod | undefined>();
  const { items, isLoading, isLoadingMore, error, hasMore, loadMore, retry } = useRecipes({ q, method });

  return (
    <div className="space-y-4 pb-4">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <RecipeFilters q={q} method={method} onQChange={setQ} onMethodChange={setMethod} />
      <div aria-live="polite">
        {isLoading && <p role="status" className="text-sm text-muted-foreground">{t("loading")}</p>}
        {error && (
          <div role="alert" className="space-y-2 text-sm text-destructive">
            <p>{error}</p>
            <Button variant="outline" size="sm" onClick={retry}>{t("retry")}</Button>
          </div>
        )}
        {!isLoading && !error && items.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      </div>
      <ul className="space-y-3">
        {items.map((r) => (
          <li key={r.slug}>
            <RecipeCard recipe={r} />
          </li>
        ))}
      </ul>
      {hasMore && !isLoading && (
        <Button variant="outline" onClick={loadMore} disabled={isLoadingMore}>
          {isLoadingMore ? t("loading") : t("loadMore")}
        </Button>
      )}
    </div>
  );
}
