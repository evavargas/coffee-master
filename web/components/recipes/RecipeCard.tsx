import Link from "next/link";
import { useTranslations } from "next-intl";

import { RecipeBadge } from "@/components/recipes/RecipeBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { safeMethod, type CatalogRecipe } from "@/lib/api/recipes";

export function RecipeCard({ recipe }: { recipe: CatalogRecipe }) {
  const t = useTranslations("recipes");
  return (
    <Card interactive>
      <CardHeader className="gap-1 p-3 pb-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <RecipeBadge kind="catalog" />
          <span className="text-xs text-muted-foreground">{t(`methods.${safeMethod(recipe.method)}`)}</span>
          {recipe.is_saved && <span className="text-xs text-muted-foreground">{t("saved")}</span>}
          {recipe.is_favorite && <span className="rounded-full bg-highlight px-2 py-0.5 text-xs font-medium text-highlight-foreground">{t("isFavorite")}</span>}
        </div>
        <CardTitle className="break-words text-lg leading-tight">
          <Link href={`/recipes/${encodeURIComponent(recipe.slug)}`} className="rounded outline-none after:absolute after:inset-0">
            {recipe.name}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5 px-3 pb-3 pt-0 text-sm">
        {recipe.coffee?.name && <p className="text-muted-foreground">{recipe.coffee.name}</p>}
        {recipe.description && <p className="line-clamp-2 break-words">{recipe.description}</p>}
      </CardContent>
    </Card>
  );
}
