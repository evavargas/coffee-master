import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Keyboard, Pressable } from "react-native";

import "@/i18n";
import { ConversationPanel } from "@/components/layout/ConversationPanel";
import { ConversationPanelProvider, useConversationPanel } from "@/context/ConversationPanelContext";
import es from "@/i18n/locales/es.json";
import { createConversation, listConversations } from "@/lib/api/chat";
import { fetchRecipe } from "@/lib/api/recipes";
import { notifyConversationsChanged, setCurrentConversation } from "@/lib/conversationsStore";
import { clearSession } from "@/lib/session";
import { clearRecipeStore } from "@/lib/recipeStore";
import { clearUserRecipeStore } from "@/lib/userRecipeStore";
import { makeRecipe } from "@/test/recipeFixtures";

jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
const mockNavigate = jest.fn();
const mockSignOut = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ navigate: mockNavigate }) }));
jest.mock("@/context/ThemeContext", () => ({
  useAppTheme: () => ({ colors: new Proxy({}, { get: (_t, name) => `theme-${String(name)}` }) }),
}));
jest.mock("lucide-react-native", () => ({ Plus: () => null }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("@/hooks/useSignOut", () => ({ useSignOut: () => mockSignOut }));
jest.mock("@/components/layout/LanguageSwitcher", () => ({ LanguageSwitcher: () => null }));
jest.mock("@/components/layout/ThemeToggle", () => ({ ThemeToggle: () => null }));
jest.mock("@/lib/api/chat", () => ({
  ...jest.requireActual<typeof import("@/lib/api/chat")>("@/lib/api/chat"),
  listConversations: jest.fn(),
  createConversation: jest.fn(),
}));
jest.mock("@/lib/api/myRecipes", () => ({ fetchUserRecipe: jest.fn() }));
jest.mock("@/lib/api/recipes", () => ({
  ...jest.requireActual<typeof import("@/lib/api/recipes")>("@/lib/api/recipes"),
  fetchRecipe: jest.fn(),
}));

const mList = listConversations as jest.MockedFunction<typeof listConversations>;
const mCreate = createConversation as jest.MockedFunction<typeof createConversation>;
const mFetchRecipe = fetchRecipe as jest.MockedFunction<typeof fetchRecipe>;

const summary = (id: number, extra: object = {}) => ({
  id,
  recipe_ref: null,
  created_at: "2026-03-01T10:00:00Z",
  updated_at: "2026-03-02T10:00:00Z",
  preview: null,
  ...extra,
});
const page = (items: ReturnType<typeof summary>[]) => ({ items, total: items.length, limit: 20, offset: 0 });

// Stands in for the header's menu button.
function OpenButton() {
  const { open } = useConversationPanel();
  return <Pressable accessibilityLabel="abrir" onPress={open} />;
}
const renderPanel = () =>
  render(
    <ConversationPanelProvider>
      <OpenButton />
      <ConversationPanel />
    </ConversationPanelProvider>,
  );
const openPanel = async () => fireEvent.press(screen.getByLabelText("abrir"));

beforeEach(async () => {
  await clearSession();
  mockNavigate.mockReset();
  mockSignOut.mockReset();
  setCurrentConversation(null);
  clearRecipeStore();
  clearUserRecipeStore();
  mList.mockReset().mockResolvedValue(page([]));
  mCreate.mockReset();
  mFetchRecipe.mockReset();
});

describe("ConversationPanel", () => {
  it("lists on open, titles by recipe, first message or date, and opens a conversation by id from any tab", async () => {
    mList.mockResolvedValue(
      page([summary(3, { recipe_ref: { kind: "catalog", ref: "v60" } }), summary(4, { preview: "¿Cómo hago un V60?" }), summary(2)]),
    );
    mFetchRecipe.mockResolvedValue(makeRecipe("v60", { name: "V60 clásico" }));
    await renderPanel();
    expect(mList).not.toHaveBeenCalled();

    await openPanel();
    expect(await screen.findByText("V60 clásico")).toBeTruthy();
    expect(screen.getByText("¿Cómo hago un V60?")).toBeTruthy();
    expect(screen.getByText(/^Conversación \d/)).toBeTruthy();

    await fireEvent.press(screen.getByText("V60 clásico"));
    expect(mockNavigate).toHaveBeenCalledWith("/(tabs)/chat?c=3");
    expect(screen.queryByText("V60 clásico")).toBeNull();
  });

  it("marks the open conversation as selected", async () => {
    mList.mockResolvedValue(page([summary(1, { preview: "uno" }), summary(2, { preview: "dos" })]));
    await renderPanel();
    await act(async () => setCurrentConversation(2));
    await openPanel();
    expect(await screen.findByText("dos")).toBeTruthy();
    expect(screen.getByRole("button", { name: "dos", selected: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "uno", selected: false })).toBeTruthy();
  });

  it("fetches the list again while open when a turn ends", async () => {
    await renderPanel();
    await openPanel();
    await waitFor(() => expect(mList).toHaveBeenCalledTimes(1));
    await act(async () => notifyConversationsChanged());
    await waitFor(() => expect(mList).toHaveBeenCalledTimes(2));
  });

  it("shows the empty and error states, and retries", async () => {
    mList.mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(page([]));
    await renderPanel();
    await openPanel();
    expect(await screen.findByText(es.chat.switcher.loadError)).toBeTruthy();
    await fireEvent.press(screen.getByText(es.chat.switcher.retry));
    expect(await screen.findByText(es.chat.switcher.empty)).toBeTruthy();
  });

  it("dismisses the keyboard before opening the panel", async () => {
    const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => undefined);
    await renderPanel();
    await openPanel();
    expect(dismiss).toHaveBeenCalledTimes(1);
    dismiss.mockRestore();
  });

  it("falls back to the raw date when Intl throws", async () => {
    mList.mockResolvedValue(page([summary(2)]));
    const spy = jest.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new RangeError("bad locale");
    });
    await renderPanel();
    await openPanel();
    expect(await screen.findByText("Conversación 2026-03-02T10:00:00Z")).toBeTruthy();
    spy.mockRestore();
  });

  it("closes from the overlay", async () => {
    mList.mockResolvedValue(page([summary(2, { preview: "dos" })]));
    await renderPanel();
    await openPanel();
    expect(await screen.findByText("dos")).toBeTruthy();
    // The scrim is outside the modal view, so it is hidden from the accessibility tree by design.
    await fireEvent.press(screen.getByLabelText(es.chat.switcher.close, { includeHiddenElements: true }));
    expect(screen.queryByText("dos")).toBeNull();
  });

  it("creates a new conversation once (double press), opens it by id and closes the panel", async () => {
    mCreate.mockResolvedValue(44);
    await renderPanel();
    await openPanel();
    const button = await screen.findByLabelText(es.chat.switcher.new);
    await fireEvent.press(button);
    await fireEvent.press(button);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/(tabs)/chat?c=44"));
    expect(mCreate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByLabelText(es.chat.switcher.new)).toBeNull());
  });

  it("signs out and closes", async () => {
    await renderPanel();
    await openPanel();
    await fireEvent.press(await screen.findByText(es.nav.signOut));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(es.nav.signOut)).toBeNull();
  });
});
