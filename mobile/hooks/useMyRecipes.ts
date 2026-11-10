import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { useTranslation } from "react-i18next";

import { getApiErrorMessage } from "@/lib/api/client";
import { fetchMyRecipes, type MyRecipeFilter, type MyRecipeItem } from "@/lib/api/myRecipes";
import { putRecipes, storeEpoch, useCachedRecipes } from "@/lib/recipeStore";
import { putUserRecipes, useCachedUserRecipes, userStoreEpoch } from "@/lib/userRecipeStore";

export const myRecipesPageSize = 12;

const epochs = () => `${storeEpoch()}:${userStoreEpoch()}`;

/** Paged "my recipes" list for one tab. Rows are read from the shared caches, so favorite/remove show up at once. */
export function useMyRecipes(filter: MyRecipeFilter) {
  const { t } = useTranslation();
  const catalog = useCachedRecipes();
  const users = useCachedUserRecipes();
  // Rows are tagged with the tab they belong to, so a tab change never shows the previous tab's rows.
  const [loaded, setLoaded] = useState<{ filter: MyRecipeFilter; keys: string[] }>({ filter, keys: [] });
  const failedOffset = useRef(0);
  const [nextOffset, setNextOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(
    async (offset: number) => {
      controller.current?.abort();
      const mine = new AbortController();
      controller.current = mine;
      const epoch = epochs();
      setError(null);
      if (offset === 0) {
        setLoaded({ filter, keys: [] });
        setNextOffset(0);
        setTotal(0);
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      try {
        const page = await fetchMyRecipes({ filter, limit: myRecipesPageSize, offset }, mine.signal);
        // A session change while in flight means this page belongs to the previous user.
        if (mine.signal.aborted || epochs() !== epoch) return;
        putRecipes(page.items.flatMap((i) => (i.kind === "catalog" ? [i.recipe] : [])));
        putUserRecipes(page.items.flatMap((i) => (i.kind === "user" ? [i.recipe] : [])));
        const fresh = page.items.map((i) => (i.kind === "catalog" ? `c:${i.recipe.slug}` : `u:${i.recipe.id}`));
        setLoaded((prev) => ({ filter, keys: [...new Set([...(offset === 0 || prev.filter !== filter ? [] : prev.keys), ...fresh])] }));
        // Advance by the server's page size: dropped malformed rows still occupy offsets.
        setNextOffset(Math.min(offset + page.limit, page.total));
        setTotal(page.total);
      } catch (e) {
        if (!mine.signal.aborted && !axios.isCancel(e) && epochs() === epoch) {
          failedOffset.current = offset;
          setError(getApiErrorMessage(e, t("myRecipes.loadError")));
        }
      } finally {
        if (controller.current === mine) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [filter, t],
  );

  useEffect(() => {
    void load(0);
    return () => controller.current?.abort();
  }, [load]);

  const current = loaded.filter === filter;
  const items = (current ? loaded.keys : []).flatMap((k): MyRecipeItem[] => {
    const ref = k.slice(2);
    if (k.startsWith("u:")) {
      const r = users.get(Number(ref));
      return r ? [{ kind: "user", recipe: r }] : [];
    }
    const r = catalog.get(ref);
    // Library flags can change after the fetch (remove/unfavorite): keep the row only while it still belongs to the tab.
    const stays = r && (filter === "favorites" ? r.is_favorite : r.is_saved);
    return r && stays ? [{ kind: "catalog", recipe: r }] : [];
  }).filter((i) => filter !== "favorites" || i.recipe.is_favorite);

  return {
    items,
    total,
    isLoading: isLoading || !current,
    isLoadingMore,
    error,
    hasMore: current && nextOffset < total,
    loadMore: () => load(nextOffset),
    // Retry only the page that failed: a failed "load more" must keep the rows already shown.
    retry: () => load(failedOffset.current),
  };
}
