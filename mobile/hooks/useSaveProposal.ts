import { useRef, useState } from "react";
import axios from "axios";
import { useTranslation } from "react-i18next";

import { getApiErrorMessage } from "@/lib/api/client";
import { saveProposal } from "@/lib/api/myRecipes";
import { onSessionChange } from "@/lib/session";
import { putUserRecipes, userStoreEpoch } from "@/lib/userRecipeStore";

/** Proposal ids with a save in flight, shared by every card so the same proposal is never posted twice at once. */
const inFlight = new Set<number>();

/** Saved proposals by id: a card unmounted by list virtualization must come back as saved. */
const savedByProposal = new Map<number, number>();
onSessionChange(() => savedByProposal.clear());

/** Saves one chat proposal into "my recipes", only when the user asks, one POST per press. */
export function useSaveProposal(proposalId: number, initialSavedId: number | null = null) {
  const { t } = useTranslation();
  const [savedId, setSavedId] = useState<number | null>(initialSavedId ?? savedByProposal.get(proposalId) ?? null);
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
      savedByProposal.set(proposalId, saved.id);
      setSavedId(saved.id);
    } catch (e) {
      if (userStoreEpoch() !== epoch) return;
      setError(
        axios.isAxiosError(e) && e.response?.status === 404
          ? t("chat.proposal.gone")
          : getApiErrorMessage(e, t("chat.proposal.saveError")),
      );
    } finally {
      busy.current = false;
      inFlight.delete(proposalId);
      setIsPending(false);
    }
  }

  return { savedId, isPending, error, save };
}
