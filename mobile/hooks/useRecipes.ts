import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { useTranslation } from "react-i18next";

import { getApiErrorMessage } from "@/lib/api/client";
import { fetchRecipes, type RecipeMethod } from "@/lib/api/recipes";
import { putRecipes, storeEpoch, useCachedRecipes } from "@/lib/recipeStore";

export const recipesPageSize = 12;

/** Paged catalog list. `q` is debounced; items are read from the shared cache so library actions show up. */
export function useRecipes(filters: { q: string; method?: RecipeMethod }, debounceMs = 300) {
  const { t } = useTranslation();
  const cache = useCachedRecipes();
  const [slugs, setSlugs] = useState<string[]>([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debouncedQ, setDebouncedQ] = useState(filters.q.trim());
  const controller = useRef<AbortController | null>(null);
  const { method } = filters;

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(filters.q.trim()), debounceMs);
    return () => clearTimeout(id);
  }, [filters.q, debounceMs]);

  const load = useCallback(
    async (offset: number) => {
      controller.current?.abort();
      const mine = new AbortController();
      controller.current = mine;
      const epoch = storeEpoch();
      setError(null);
      if (offset === 0) {
        // A new query starts from scratch, so a failure can't leave the previous query's rows on screen.
        setSlugs([]);
        setNextOffset(0);
        setTotal(0);
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      try {
        const page = await fetchRecipes({ q: debouncedQ, method, limit: recipesPageSize, offset }, mine.signal);
        // A session change while in flight means this page belongs to the previous user.
        if (mine.signal.aborted || storeEpoch() !== epoch) return;
        putRecipes(page.items);
        setSlugs((prev) => [...new Set([...(offset === 0 ? [] : prev), ...page.items.map((r) => r.slug)])]);
        // Advance by the server's page size, not items.length: dropped malformed rows still occupy offsets.
        setNextOffset(Math.min(offset + page.limit, page.total));
        setTotal(page.total);
      } catch (e) {
        if (!mine.signal.aborted && !axios.isCancel(e) && storeEpoch() === epoch) setError(getApiErrorMessage(e, t("recipes.loadError")));
      } finally {
        // Only the latest request clears the flags; a superseded one leaves them to its successor.
        if (controller.current === mine) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [debouncedQ, method, t],
  );

  useEffect(() => {
    void load(0);
    return () => controller.current?.abort();
  }, [load]);

  const items = slugs.flatMap((s) => cache.get(s) ?? []);
  return { items, total, isLoading, isLoadingMore, error, hasMore: nextOffset < total, loadMore: () => load(nextOffset), retry: () => load(0) };
}
