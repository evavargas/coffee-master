import { useTranslations } from "next-intl";

/** Origin badge: Coffee Master catalog recipe or the user's own. */
export function RecipeBadge({ kind }: { kind: "catalog" | "user" }) {
  const t = useTranslations("recipes.badge");
  // Lavender for the catalog, peach for the user's own recipes; brown text on both.
  const tone = kind === "catalog" ? "bg-accent text-accent-foreground" : "bg-highlight text-highlight-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{t(kind)}</span>;
}
