import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/AppShell";
import { createConversation, fetchConversations } from "@/lib/api/chat";
import { fetchRecipe } from "@/lib/api/recipes";
import { clearRecipeStore } from "@/lib/recipeStore";
import { clearUserRecipeStore } from "@/lib/userRecipeStore";
import { notifyConversationsChanged, setCurrentConversation } from "@/lib/conversationsStore";
import { makeRecipe } from "@/test/recipeFixtures";
import es from "@/messages/es.json";

const push = vi.fn();
const replace = vi.fn();
let pathname = "/chat";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }), usePathname: () => pathname }));
vi.mock("@/components/layout/AppControls", () => ({ AppControls: () => null }));
vi.mock("@/lib/api/chat", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/chat")>()),
  fetchConversations: vi.fn(),
  createConversation: vi.fn(),
}));
vi.mock("@/lib/api/recipes", async (orig) => ({ ...(await orig<typeof import("@/lib/api/recipes")>()), fetchRecipe: vi.fn() }));

const item = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  recipe_ref: null,
  created_at: "2026-01-02T10:00:00Z",
  updated_at: "2026-01-02T10:00:00Z",
  preview: null,
  ...extra,
});
const page = (items: ReturnType<typeof item>[]) => ({ items, total: items.length, limit: 20, offset: 0 });
const renderShell = () =>
  render(
    <NextIntlClientProvider locale="es" messages={es}>
      <AppShell userName="Ana">
        <p>contenido</p>
      </AppShell>
    </NextIntlClientProvider>,
  );
const sidebar = () => within(document.getElementById("app-sidebar") as HTMLElement);

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  pathname = "/chat";
  window.localStorage.clear();
  setCurrentConversation(null);
  clearRecipeStore();
  clearUserRecipeStore();
  vi.mocked(fetchConversations).mockReset().mockResolvedValue(page([]));
  vi.mocked(createConversation).mockReset();
  vi.mocked(fetchRecipe).mockReset();
});
afterEach(cleanup);

describe("AppShell sidebar", () => {
  it("titles each conversation with its recipe, else its first message, else its date, and links to it", async () => {
    vi.mocked(fetchConversations).mockResolvedValue(
      page([item(1, { recipe_ref: { kind: "catalog", ref: "v60-x" } }), item(2, { preview: "¿Cómo hago un V60?" }), item(3)]),
    );
    vi.mocked(fetchRecipe).mockResolvedValue(makeRecipe("v60-x", { name: "V60 Brillante" }));
    renderShell();
    expect(await screen.findByRole("link", { name: "V60 Brillante" })).toHaveAttribute("href", "/chat?c=1");
    expect(screen.getByRole("link", { name: "¿Cómo hago un V60?" })).toHaveAttribute("href", "/chat?c=2");
    expect(screen.getByRole("link", { name: /^Conversación \d/ })).toHaveAttribute("href", "/chat?c=3");
  });

  it("marks the open conversation, only while the chat is shown", async () => {
    vi.mocked(fetchConversations).mockResolvedValue(page([item(1, { preview: "uno" }), item(2, { preview: "dos" })]));
    renderShell();
    await screen.findByRole("link", { name: "uno" });
    act(() => setCurrentConversation(2));
    expect(screen.getByRole("link", { name: "dos" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "uno" })).not.toHaveAttribute("aria-current");
  });

  it("fetches the list again when a turn ends", async () => {
    renderShell();
    await waitFor(() => expect(fetchConversations).toHaveBeenCalledTimes(1));
    act(() => notifyConversationsChanged());
    await waitFor(() => expect(fetchConversations).toHaveBeenCalledTimes(2));
  });

  it("shows the empty and error states", async () => {
    renderShell();
    expect(await screen.findByText("Todavía no tenés conversaciones.")).toBeInTheDocument();
    cleanup();
    vi.mocked(fetchConversations).mockRejectedValueOnce(new Error("boom"));
    renderShell();
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar tus conversaciones.");
  });

  it("creates a conversation once (double click) and navigates to it", async () => {
    vi.mocked(createConversation).mockResolvedValue(33);
    renderShell();
    const button = sidebar().getByRole("button", { name: "Nueva conversación" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/chat?c=33"));
    expect(createConversation).toHaveBeenCalledTimes(1);
  });

  it("opens the menu as a drawer, closes it with Escape and returns focus to the menu button", async () => {
    renderShell();
    const menu = screen.getByRole("button", { name: "Menú" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    const aside = document.getElementById("app-sidebar") as HTMLElement;
    await waitFor(() => expect(aside).toHaveFocus());
    fireEvent.keyDown(aside, { key: "Escape" });
    await waitFor(() => expect(menu).toHaveFocus());
    expect(menu).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the drawer when a destination is chosen", async () => {
    vi.mocked(fetchConversations).mockResolvedValue(page([item(5, { preview: "cinco" })]));
    renderShell();
    const menu = screen.getByRole("button", { name: "Menú" });
    fireEvent.click(menu);
    fireEvent.click(await screen.findByRole("link", { name: "cinco" }));
    expect(menu).toHaveAttribute("aria-expanded", "false");
  });

  it("folds the docked sidebar away and remembers it", async () => {
    renderShell();
    fireEvent.click(sidebar().getByRole("button", { name: "Ocultar barra lateral" }));
    expect(window.localStorage.getItem("coffeemaster.sidebar")).toBe("0");
    expect(screen.getByRole("button", { name: "Mostrar barra lateral" })).toBeInTheDocument();
  });

  it("shows the user's name and the content", () => {
    renderShell();
    expect(sidebar().getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });
});
