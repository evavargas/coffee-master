import Link from "next/link";
import { useTranslations } from "next-intl";

import { RecipeBadge } from "@/components/recipes/RecipeBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { safeMethod, type CatalogRecipe } from "@/lib/api/recipes";

export function RecipeCard({ recipe }: { recipe: CatalogRecipe }) {
  const t = useTranslations("recipes");
  return (
    <Card>
      <CardHeader className="gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <RecipeBadge kind="catalog" />
          <span className="text-xs text-muted-foreground">{t(`methods.${safeMethod(recipe.method)}`)}</span>
          {recipe.is_saved && <span className="text-xs text-muted-foreground">{t("saved")}</span>}
          {recipe.is_favorite && <span className="text-xs text-muted-foreground">{t("isFavorite")}</span>}
        </div>
        <CardTitle className="break-words text-lg leading-tight">
          <Link href={`/recipes/${encodeURIComponent(recipe.slug)}`} className="rounded focus-visible:outline-2 focus-visible:outline-ring">
            {recipe.name}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 p-4 pt-0 text-sm">
        {recipe.coffee?.name && <p className="text-muted-foreground">{recipe.coffee.name}</p>}
        {recipe.description && <p className="break-words">{recipe.description}</p>}
      </CardContent>
    </Card>
  );
}
