import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { MyRecipeFilter } from "@/lib/api/myRecipes";

const filters: MyRecipeFilter[] = ["all", "favorites", "created", "saved"];

/** Tab buttons mapped one-to-one to the `filter` query of GET /api/me/recipes. */
export function MyRecipesTabs({ value, onChange }: { value: MyRecipeFilter; onChange: (v: MyRecipeFilter) => void }) {
  const t = useTranslations("myRecipes");
  return (
    <div role="group" aria-label={t("filtersLabel")} className="flex flex-wrap gap-2">
      {filters.map((f) => (
        <Button key={f} size="sm" variant={f === value ? "default" : "outline"} aria-pressed={f === value} onClick={() => onChange(f)}>
          {t(`tabs.${f}`)}
        </Button>
      ))}
    </div>
  );
}
