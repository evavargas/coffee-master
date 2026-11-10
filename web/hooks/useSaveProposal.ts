"use client";

import { useRef, useState } from "react";
import axios from "axios";
import { useTranslations } from "next-intl";

import { getApiErrorMessage } from "@/lib/api/client";
import { saveProposal } from "@/lib/api/myRecipes";
import { putUserRecipes, userStoreEpoch } from "@/lib/userRecipeStore";

/** Proposal ids with a save in flight, shared by every card so the same proposal is never posted twice at once. */
const inFlight = new Set<number>();

/** Saves one chat proposal into "my recipes", only when the user asks, one POST per click. */
export function useSaveProposal(proposalId: number, initialSavedId: number | null = null) {
  const t = useTranslations("chat.proposal");
  const [savedId, setSavedId] = useState<number | null>(initialSavedId);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  async function save() {
    if (busy.current || savedId !== null || inFlight.has(proposalId)) return;
    busy.current = true;
    inFlight.add(proposalId);
    const epoch = userStoreEpoch();
    setIsPending(true);
    setError(null);
    try {
      const saved = await saveProposal(proposalId);
      if (userStoreEpoch() !== epoch) return; // the session changed: this belongs to the previous user
      if (saved.recipe) putUserRecipes([saved.recipe]);
      setSavedId(saved.id);
    } catch (e) {
      if (userStoreEpoch() !== epoch) return;
      setError(axios.isAxiosError(e) && e.response?.status === 404 ? t("gone") : getApiErrorMessage(e, t("saveError")));
    } finally {
      busy.current = false;
      inFlight.delete(proposalId);
      setIsPending(false);
    }
  }

  return { savedId, isPending, error, save };
}
