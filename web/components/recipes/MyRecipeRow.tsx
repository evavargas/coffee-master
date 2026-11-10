import Link from "next/link";
import { useTranslations } from "next-intl";

import { ConfirmButton } from "@/components/recipes/ConfirmButton";
import { RecipeBadge } from "@/components/recipes/RecipeBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRecipeLibrary } from "@/hooks/useRecipeLibrary";
import { useUserRecipeActions } from "@/hooks/useUserRecipeActions";
import { safeMethod, type CatalogRecipe } from "@/lib/api/recipes";
import type { MyRecipeItem, UserRecipe } from "@/lib/api/myRecipes";

interface Shape {
  kind: "catalog" | "user";
  name: string;
  method: string;
  description?: string | null;
  href: string;
  isFavorite: boolean;
  isPending: boolean;
  toggleFavorite: () => void;
  remove: () => void;
  deleteLabel: string;
  confirmMessage: string;
}

function Row({ s }: { s: Shape }) {
  const t = useTranslations("recipes");
  return (
    <Card>
      <CardHeader className="gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <RecipeBadge kind={s.kind} />
          <span className="text-xs text-muted-foreground">{t(`methods.${safeMethod(s.method)}`)}</span>
          {s.isFavorite && <span className="text-xs text-muted-foreground">{t("isFavorite")}</span>}
        </div>
        <CardTitle className="break-words text-lg leading-tight">
          <Link href={s.href} className="rounded focus-visible:outline-2 focus-visible:outline-ring">
            {s.name}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0 text-sm">
        {s.description && <p className="break-words">{s.description}</p>}
        <div className="flex flex-wrap items-start gap-2">
          <Button variant="outline" size="sm" aria-pressed={s.isFavorite} onClick={s.toggleFavorite} disabled={s.isPending}>
            {s.isFavorite ? t("unfavorite") : t("favorite")}
          </Button>
          <ConfirmButton label={s.deleteLabel} message={s.confirmMessage} onConfirm={s.remove} disabled={s.isPending} />
        </div>
      </CardContent>
    </Card>
  );
}

function CatalogRow({ recipe, onError }: { recipe: CatalogRecipe; onError: (m: string) => void }) {
  const t = useTranslations("myRecipes");
  const lib = useRecipeLibrary(recipe.slug, onError);
  return (
    <Row
      s={{
        kind: "catalog",
        name: recipe.name,
        method: recipe.method,
        description: recipe.description,
        href: `/recipes/${encodeURIComponent(recipe.slug)}`,
        isFavorite: recipe.is_favorite,
        isPending: lib.isPending,
        toggleFavorite: lib.toggleFavorite,
        remove: lib.remove,
        deleteLabel: t("removeFromList"),
        confirmMessage: t("confirmRemove"),
      }}
    />
  );
}

function UserRow({ recipe, onError }: { recipe: UserRecipe; onError: (m: string) => void }) {
  const t = useTranslations("myRecipes");
  const actions = useUserRecipeActions(recipe.id, onError);
  return (
    <Row
      s={{
        kind: "user",
        name: recipe.name,
        method: recipe.method,
        description: recipe.description,
        href: `/my-recipes/${recipe.id}`,
        isFavorite: recipe.is_favorite,
        isPending: actions.isPending,
        toggleFavorite: actions.toggleFavorite,
        remove: actions.remove,
        deleteLabel: t("delete"),
        confirmMessage: t("confirmDelete"),
      }}
    />
  );
}

/** Errors go to the list (`onError`), because a rolled-back row may have been unmounted and remounted meanwhile. */
export function MyRecipeRow({ item, onError }: { item: MyRecipeItem; onError: (message: string) => void }) {
  return item.kind === "catalog" ? <CatalogRow recipe={item.recipe} onError={onError} /> : <UserRow recipe={item.recipe} onError={onError} />;
}
