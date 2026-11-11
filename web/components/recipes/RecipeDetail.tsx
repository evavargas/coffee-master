import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { RecipeBadge } from "@/components/recipes/RecipeBadge";
import { Button } from "@/components/ui/button";
import type { UserRecipe } from "@/lib/api/myRecipes";
import { safeMethod, type CatalogRecipe } from "@/lib/api/recipes";

type Range = { min: number; max?: number | null } | null | undefined;

/** "a–b" or a single value, with a unit. Returns null when there is no range. */
export function formatRange(r: Range, unit = ""): string | null {
  if (!r || typeof r.min !== "number") return null;
  const text = r.max != null && r.max !== r.min ? `${r.min}–${r.max}` : `${r.min}`;
  return unit ? `${text} ${unit}` : text;
}

export interface RecipeActions {
  isPending: boolean;
  error: string | null;
  save: () => void;
  remove: () => void;
  toggleFavorite: () => void;
  ask: () => void;
  adapt: () => void;
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-4 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right break-words">{value}</dd>
    </div>
  );
}

export function RecipeDetail({ recipe, actions }: { recipe: CatalogRecipe | UserRecipe; actions?: RecipeActions }) {
  const t = useTranslations("recipes");
  const catalog = "slug" in recipe ? recipe : null;
  const coffee = recipe.coffee;
  const grind = recipe.grind;
  const steps = recipe.steps ?? [];
  const ratio = typeof recipe.ratio === "number" ? `1:${recipe.ratio}` : null;

  return (
    <article className="space-y-5 pb-4">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <RecipeBadge kind={catalog ? "catalog" : "user"} />
          <span className="text-sm text-muted-foreground">{t(`methods.${safeMethod(recipe.method)}`)}</span>
        </div>
        <h2 className="break-words text-2xl font-semibold">{recipe.name}</h2>
        {recipe.description && <p className="break-words">{recipe.description}</p>}
        {catalog?.archived && (
          <p role="note" className="rounded-lg border border-border bg-muted p-2 text-sm">
            {t("archivedNotice")}
          </p>
        )}
      </header>

      {actions && catalog && (
        <section aria-label={t("actionsLabel")} className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {catalog.is_saved ? (
              <Button variant="outline" onClick={actions.remove} disabled={actions.isPending}>
                {t("remove")}
              </Button>
            ) : (
              <Button onClick={actions.save} disabled={actions.isPending}>
                {t("save")}
              </Button>
            )}
            <Button variant="outline" className="aria-pressed:border-transparent aria-pressed:bg-highlight aria-pressed:text-highlight-foreground aria-pressed:hover:bg-highlight/90" aria-pressed={catalog.is_favorite} onClick={actions.toggleFavorite} disabled={actions.isPending}>
              {catalog.is_favorite ? t("unfavorite") : t("favorite")}
            </Button>
            <Button variant="outline" onClick={actions.ask} disabled={actions.isPending}>
              {t("ask")}
            </Button>
            <Button variant="outline" onClick={actions.adapt} disabled={actions.isPending}>
              {t("adapt")}
            </Button>
          </div>
          {actions.error && (
            <p role="alert" className="text-sm text-destructive">
              {actions.error}
            </p>
          )}
        </section>
      )}

      <section aria-label={t("parametersLabel")}>
        <dl className="divide-y divide-border text-sm">
          <Row label={t("coffeeName")} value={coffee?.name} />
          <Row label={t("origin")} value={coffee?.origin} />
          <Row label={t("process")} value={coffee?.process} />
          <Row label={t("roast")} value={coffee?.roast} />
          <Row label={t("grindClicks")} value={formatRange(grind?.clicks)} />
          <Row label={t("grindDescription")} value={grind?.description} />
          <Row label={t("grinder")} value={grind?.grinder} />
          <Row label={t("temperature")} value={formatRange(recipe.temperature_c, "°C")} />
          <Row label={t("ratio")} value={ratio} />
          <Row label={t("dose")} value={formatRange(recipe.dose_g, "g")} />
          <Row label={t("water")} value={formatRange(recipe.water_g, "g")} />
          <Row label={t("yield")} value={formatRange(recipe.yield_ml, "ml")} />
          <Row label={t("brewTime")} value={formatRange(recipe.brew_time_seconds, "s")} />
        </dl>
      </section>

      {steps.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-semibold">{t("steps")}</h3>
          <ol className="list-decimal space-y-2 pl-7 text-sm">
            {steps.map((s, i) => (
              <li key={i} className="break-words">
                {s.action}
                {(s.pour_to_g != null || s.at_seconds != null) && (
                  <span className="block text-muted-foreground">
                    {[s.pour_to_g != null ? t("pourTo", { grams: s.pour_to_g }) : null, s.at_seconds != null ? t("atSeconds", { seconds: s.at_seconds }) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {recipe.notes && (
        <section className="space-y-1">
          <h3 className="font-semibold">{t("notes")}</h3>
          <p className="break-words text-sm">{recipe.notes}</p>
        </section>
      )}

      {catalog?.source?.section && (
        <p className="text-xs text-muted-foreground">{t("source", { section: catalog.source.section })}</p>
      )}
    </article>
  );
}
