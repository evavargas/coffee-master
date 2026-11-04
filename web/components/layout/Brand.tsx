import { useTranslations } from "next-intl";

/** The app's name with a line below it. The header of the auth pages and the chat. */
export function Brand({ subtitle }: { subtitle: string }) {
  const t = useTranslations("common");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-primary">{t("appName")}</h1>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}
