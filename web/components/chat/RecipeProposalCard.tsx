"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { formatRange } from "@/components/recipes/RecipeDetail";
import { Button } from "@/components/ui/button";
import { useSaveProposal } from "@/hooks/useSaveProposal";
import { safeMethod } from "@/lib/api/recipes";
import type { ChatMessage } from "@/lib/api/chat";

const previewSteps = 3;

/** A recipe proposed by the assistant. It is only saved when the user presses the button. */
export function RecipeProposalCard({ proposal }: { proposal: NonNullable<ChatMessage["proposal"]> }) {
  const t = useTranslations("chat.proposal");
  const tr = useTranslations("recipes");
  const { savedId, isPending, error, save } = useSaveProposal(proposal.proposal_id, proposal.saved_recipe_id);
  const { recipe } = proposal;
  const steps = recipe.steps ?? [];
  const facts = [
    recipe.coffee?.name,
    recipe.dose_g && formatRange(recipe.dose_g, "g"),
    recipe.water_g && formatRange(recipe.water_g, "g"),
    typeof recipe.ratio === "number" ? `1:${recipe.ratio}` : null,
    recipe.temperature_c && formatRange(recipe.temperature_c, "°C"),
    recipe.brew_time_seconds && formatRange(recipe.brew_time_seconds, "s"),
  ].filter(Boolean);

  return (
    <article aria-label={t("ariaLabel", { name: recipe.name })} className="max-w-[85%] self-start space-y-2 rounded-xl border border-border bg-background p-3 text-sm">
      <p className="text-xs text-muted-foreground">{t("title")}</p>
      <h3 className="break-words font-semibold">{recipe.name}</h3>
      <p className="text-muted-foreground">{tr(`methods.${safeMethod(recipe.method)}`)}</p>
      {facts.length > 0 && <p className="break-words">{facts.join(" · ")}</p>}
      {steps.length > 0 && (
        <ol className="list-decimal space-y-1 pl-5">
          {steps.slice(0, previewSteps).map((s, i) => (
            <li key={i} className="break-words">
              {s.action}
            </li>
          ))}
          {steps.length > previewSteps && <li className="list-none text-muted-foreground">{t("moreSteps", { count: steps.length - previewSteps })}</li>}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {savedId === null ? (
          <Button type="button" size="sm" onClick={() => void save()} disabled={isPending}>
            {isPending ? t("saving") : t("save")}
          </Button>
        ) : (
          <>
            <span role="status" className="font-medium">
              {t("saved")}
            </span>
            <Link href={`/my-recipes/${savedId}`} className="underline focus-visible:outline-2 focus-visible:outline-ring">
              {t("view")}
            </Link>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </article>
  );
}
