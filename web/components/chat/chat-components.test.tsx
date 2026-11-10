import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatView } from "@/components/chat/ChatView";
import { ConversationSwitcher } from "@/components/chat/ConversationSwitcher";
import { RecipeProposalCard } from "@/components/chat/RecipeProposalCard";
import { createConversation, fetchConversation, fetchConversations, fetchLatestConversation, streamChatMessage } from "@/lib/api/chat";
import { saveProposal } from "@/lib/api/myRecipes";
import { fetchRecipe } from "@/lib/api/recipes";
import { clearSession } from "@/lib/session";
import { clearRecipeStore } from "@/lib/recipeStore";
import { clearUserRecipeStore } from "@/lib/userRecipeStore";
import { makeRecipe, makeUserRecipe } from "@/test/recipeFixtures";
import es from "@/messages/es.json";

const push = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), useSearchParams: () => new URLSearchParams(search) }));
vi.mock("@/lib/api/chat", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/chat")>()),
  fetchLatestConversation: vi.fn(),
  fetchConversation: vi.fn(),
  fetchConversations: vi.fn(),
  createConversation: vi.fn(),
  streamChatMessage: vi.fn(),
}));
vi.mock("@/lib/api/myRecipes", async (orig) => ({ ...(await orig<typeof import("@/lib/api/myRecipes")>()), saveProposal: vi.fn() }));
vi.mock("@/lib/api/recipes", async (orig) => ({ ...(await orig<typeof import("@/lib/api/recipes")>()), fetchRecipe: vi.fn() }));

const wrap = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="es" messages={es}>{ui}</NextIntlClientProvider>);
const proposal = (id: number, name: string, saved: number | null = null) => ({
  proposal_id: id,
  saved_recipe_id: saved,
  recipe: { name, method: "v60", steps: [{ action: "Verter" }] } as never,
});

beforeEach(() => {
  Element.prototype.scrollTo = vi.fn(); // jsdom does not implement it
  search = "";
  push.mockReset();
  clearRecipeStore();
  clearUserRecipeStore();
  vi.mocked(fetchLatestConversation).mockReset().mockResolvedValue({ conversation_id: null, messages: [] });
  vi.mocked(fetchConversation).mockReset();
  vi.mocked(fetchConversations).mockReset();
  vi.mocked(createConversation).mockReset();
  vi.mocked(saveProposal).mockReset();
  vi.mocked(fetchRecipe).mockReset();
  vi.mocked(streamChatMessage).mockReset();
});
afterEach(cleanup);

describe("RecipeProposalCard", () => {
  it("each message gets its own card and the chosen one is saved with its own proposal_id", async () => {
    vi.mocked(fetchLatestConversation).mockResolvedValue({
      conversation_id: 1,
      messages: [
        { role: "assistant", content: "uno", proposal: proposal(11, "Receta A") },
        { role: "assistant", content: "dos", proposal: proposal(22, "Receta B") },
      ],
    });
    vi.mocked(saveProposal).mockResolvedValue({ id: 70, recipe: makeUserRecipe(70) });
    wrap(<ChatView />);

    const buttons = await screen.findAllByRole("button", { name: "Guardar en mis recetas" });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);
    fireEvent.click(buttons[1]);

    expect(await screen.findByText("Guardada")).toBeInTheDocument();
    expect(saveProposal).toHaveBeenCalledTimes(1);
    expect(saveProposal).toHaveBeenCalledWith(22);
    expect(screen.getByRole("link", { name: "Ver en mis recetas" })).toHaveAttribute("href", "/my-recipes/70");
    expect(screen.getAllByRole("button", { name: "Guardar en mis recetas" })).toHaveLength(1);
  });

  it("renders a persisted saved proposal as already saved", () => {
    wrap(<RecipeProposalCard proposal={proposal(3, "X", 41)} />);
    expect(screen.getByText("Guardada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar en mis recetas" })).not.toBeInTheDocument();
  });
});

describe("malformed proposals", () => {
  it("never crash ChatView (steps as string or object)", async () => {
    vi.mocked(fetchLatestConversation).mockResolvedValue({
      conversation_id: 1,
      messages: [
        { role: "assistant", content: "uno", proposal: { proposal_id: 1, saved_recipe_id: null, recipe: { name: "Rota", method: "v60", steps: "texto", coffee: { name: 4 } } as never } },
        { role: "assistant", content: "dos", proposal: { proposal_id: 2, saved_recipe_id: null, recipe: { name: "Rota 2", method: "v60", steps: { action: "x" } } as never } },
      ],
    });
    wrap(<ChatView />);
    expect(await screen.findByText("uno")).toBeInTheDocument();
    expect(screen.getByText("dos")).toBeInTheDocument();
  });

  it("an error inside a card is contained by the boundary", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(fetchLatestConversation).mockResolvedValue({
      conversation_id: 1,
      messages: [{ role: "assistant", content: "texto", proposal: { proposal_id: 1, saved_recipe_id: null, recipe: null as never } }],
    });
    wrap(<ChatView />);
    expect(await screen.findByText("texto")).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("pluralizes the extra steps", () => {
    const steps = Array.from({ length: 4 }, (_, i) => ({ action: `p${i}` }));
    wrap(<RecipeProposalCard proposal={{ proposal_id: 1, saved_recipe_id: null, recipe: { name: "R", method: "v60", steps } as never }} />);
    expect(screen.getByText("y 1 paso más")).toBeInTheDocument();
  });
});

describe("ChatView with ?c and intent", () => {
  it("opens the conversation by id, shows the recipe banner and prefills (without sending) the opening prompt", async () => {
    search = "c=8&intent=adapt";
    vi.mocked(fetchConversation).mockResolvedValue({ id: 8, messages: [], recipe_ref: { kind: "catalog", ref: "v60-x" } });
    vi.mocked(fetchRecipe).mockResolvedValue(makeRecipe("v60-x", { name: "V60 Brillante" }));
    wrap(<ChatView />);

    expect(await screen.findByText("Hablando sobre: V60 Brillante")).toBeInTheDocument();
    expect(fetchConversation).toHaveBeenCalledWith(8, expect.anything());
    expect(fetchLatestConversation).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Pregunta" })).toHaveValue("Adaptá esta receta a mi equipo");
    expect(streamChatMessage).not.toHaveBeenCalled();
  });

  it("falls back to a generic banner when the recipe name cannot be resolved", async () => {
    search = "c=8";
    vi.mocked(fetchConversation).mockResolvedValue({ id: 8, messages: [], recipe_ref: { kind: "catalog", ref: "gone" } });
    vi.mocked(fetchRecipe).mockRejectedValue(new Error("nope"));
    wrap(<ChatView />);
    expect(await screen.findByText("Hablando sobre una receta")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Pregunta" })).toHaveValue("");
  });

  it("shows the banner for a /latest conversation that has a recipe_ref", async () => {
    vi.mocked(fetchLatestConversation).mockResolvedValue({ conversation_id: 2, messages: [], recipe_ref: { kind: "catalog", ref: "v60-x" } });
    vi.mocked(fetchRecipe).mockResolvedValue(makeRecipe("v60-x", { name: "V60 Brillante" }));
    wrap(<ChatView />);
    expect(await screen.findByText("Hablando sobre: V60 Brillante")).toBeInTheDocument();
  });

  it("does not prefill the opening prompt when the conversation fails to load (404)", async () => {
    search = "c=8&intent=ask";
    vi.mocked(fetchConversation).mockRejectedValue(new Error("x"));
    wrap(<ChatView />);
    await screen.findByRole("alert");
    expect(screen.getByRole("textbox", { name: "Pregunta" })).toHaveValue("");
  });

  it("loads the latest conversation when there is no ?c", async () => {
    vi.mocked(fetchLatestConversation).mockResolvedValue({ conversation_id: 2, messages: [{ role: "user", content: "hola" }] });
    wrap(<ChatView />);
    expect(await screen.findByText("hola")).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("does not write a conversation that resolves after a session change", async () => {
    search = "c=8";
    let resolve!: (v: Awaited<ReturnType<typeof fetchConversation>>) => void;
    vi.mocked(fetchConversation).mockReturnValue(new Promise((r) => (resolve = r)));
    wrap(<ChatView />);
    act(() => clearSession());
    await act(async () => resolve({ id: 8, messages: [{ role: "user", content: "secreto" }], recipe_ref: null }));
    expect(screen.queryByText("secreto")).not.toBeInTheDocument();
  });
});

describe("ConversationSwitcher", () => {
  const page = (ids: number[]) => ({
    items: ids.map((id) => ({ id, recipe_ref: id === 1 ? { kind: "catalog" as const, ref: "v60-x" } : null, created_at: "2026-01-02T10:00:00Z", updated_at: "2026-01-02T10:00:00Z" })),
    total: ids.length,
    limit: 20,
    offset: 0,
  });

  it("lists conversations lazily with recipe names or a dated title, and links to each", async () => {
    vi.mocked(fetchConversations).mockResolvedValue(page([1, 2]));
    vi.mocked(fetchRecipe).mockResolvedValue(makeRecipe("v60-x", { name: "V60 Brillante" }));
    wrap(<ConversationSwitcher currentId={2} />);
    expect(fetchConversations).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Conversaciones" }));
    expect(await screen.findByRole("link", { name: "V60 Brillante" })).toHaveAttribute("href", "/chat?c=1");
    const second = screen.getByRole("link", { name: /^Conversación del / });
    expect(second).toHaveAttribute("href", "/chat?c=2");
    expect(second).toHaveAttribute("aria-current", "page");
  });

  it("Escape closes the panel and returns focus to the toggle", async () => {
    vi.mocked(fetchConversations).mockResolvedValue(page([2]));
    wrap(<ConversationSwitcher currentId={null} />);
    const toggle = screen.getByRole("button", { name: "Conversaciones" });
    fireEvent.click(toggle);
    const panel = await screen.findByRole("region", { name: "Conversaciones" });
    await waitFor(() => expect(panel).toHaveFocus());
    fireEvent.keyDown(panel, { key: "Escape" });
    await waitFor(() => expect(toggle).toHaveFocus());
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("shows the empty and error states", async () => {
    vi.mocked(fetchConversations).mockResolvedValueOnce(page([]));
    wrap(<ConversationSwitcher currentId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Conversaciones" }));
    expect(await screen.findByText("Todavía no tenés conversaciones.")).toBeInTheDocument();
    cleanup();

    vi.mocked(fetchConversations).mockRejectedValueOnce(new Error("boom"));
    wrap(<ConversationSwitcher currentId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Conversaciones" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar tus conversaciones.");
  });

  it("creates a conversation once (double click) and navigates to it", async () => {
    vi.mocked(createConversation).mockResolvedValue(33);
    wrap(<ConversationSwitcher currentId={null} />);
    const button = screen.getByRole("button", { name: "Nueva conversación" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/chat?c=33"));
    expect(createConversation).toHaveBeenCalledTimes(1);
  });
});
