import Image from "next/image";
import { useTranslations } from "next-intl";

/** The app's name with an optional line below it. The header of the auth pages and the sidebar. */
export function Brand({ subtitle }: { subtitle?: string }) {
  const t = useTranslations("common");

  return (
    <div className="flex items-center gap-3">
      <Image src="/brand/cup-lavanda.png" alt="" width={40} height={40} priority />
      <div>
        <h1 className="font-display text-2xl font-normal whitespace-nowrap text-primary">{t("appName")}</h1>
        {subtitle && <p className="font-hand text-sm text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}
