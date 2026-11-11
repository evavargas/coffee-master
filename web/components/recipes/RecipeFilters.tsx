import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/select";
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
      <div className="space-y-1 sm:w-56">
        <Label htmlFor="recipe-method">{t("methodLabel")}</Label>
        <OptionSelect
          id="recipe-method"
          value={method ?? ""}
          onValueChange={(v) => onMethodChange(v ? safeMethod(v) : undefined)}
          options={[{ value: "", label: t("allMethods") }, ...recipeMethods.map((m) => ({ value: m, label: t(`methods.${m}`) }))]}
        />
      </div>
    </div>
  );
}
