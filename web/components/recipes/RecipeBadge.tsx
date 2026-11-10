import { useTranslations } from "next-intl";

/** Origin badge: Coffee Master catalog recipe or the user's own. */
export function RecipeBadge({ kind }: { kind: "catalog" | "user" }) {
  const t = useTranslations("recipes.badge");
  return <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{t(kind)}</span>;
}
