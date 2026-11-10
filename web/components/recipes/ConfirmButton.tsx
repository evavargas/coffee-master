import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

/** Destructive action with an in-page confirm step (never window.confirm). Escape cancels. */
export function ConfirmButton({ label, message, onConfirm, disabled }: { label: string; message: string; onConfirm: () => void; disabled?: boolean }) {
  const t = useTranslations("myRecipes");
  const [asking, setAsking] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (asking) confirm.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      trigger.current?.focus();
    }
  }, [asking]);

  const cancel = () => {
    returnFocus.current = true;
    setAsking(false);
  };

  if (!asking) {
    return (
      <Button ref={trigger} variant="outline" size="sm" onClick={() => setAsking(true)} disabled={disabled}>
        {label}
      </Button>
    );
  }
  return (
    <div
      role="alertdialog"
      aria-label={label}
      onKeyDown={(e) => e.key === "Escape" && cancel()}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 text-sm"
    >
      <p>{message}</p>
      <Button
        ref={confirm}
        variant="outline"
        size="sm"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
        disabled={disabled}
      >
        {t("confirmYes")}
      </Button>
      <Button variant="ghost" size="sm" onClick={cancel}>
        {t("cancel")}
      </Button>
    </div>
  );
}
