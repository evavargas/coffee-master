import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recipeMethods, safeMethod, type RecipeMethod } from "@/lib/api/recipes";

interface Props {
  q: string;
  method: RecipeMethod | undefined;
  onQChange: (q: string) => void;
  onMethodChange: (method: RecipeMethod | undefined) => void;
}

export function RecipeFilters({ q, method, onQChange, onMethodChange }: Props) {
  const t = useTranslations("recipes");
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="flex-1 space-y-1">
        <Label htmlFor="recipe-search">{t("searchLabel")}</Label>
        <Input id="recipe-search" type="search" value={q} placeholder={t("searchPlaceholder")} onChange={(e) => onQChange(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="recipe-method">{t("methodLabel")}</Label>
        <select
          id="recipe-method"
          value={method ?? ""}
          onChange={(e) => onMethodChange(e.target.value ? safeMethod(e.target.value) : undefined)}
          className="flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
        >
          <option value="">{t("allMethods")}</option>
          {recipeMethods.map((m) => (
            <option key={m} value={m}>
              {t(`methods.${m}`)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
