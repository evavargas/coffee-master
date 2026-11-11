import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Text } from "react-native";

import "@/i18n";
import { CardErrorBoundary } from "@/components/chat/CardErrorBoundary";
import { ChatScreen } from "@/components/chat/ChatScreen";
import { RecipeProposalCard } from "@/components/chat/RecipeProposalCard";
import es from "@/i18n/locales/es.json";
import {
  createConversation,
  getConversation,
  getLatestConversation,
  listConversations,
  type ChatMessage,
} from "@/lib/api/chat";
import { saveProposal } from "@/lib/api/myRecipes";
import { fetchRecipe } from "@/lib/api/recipes";
import { clearSession } from "@/lib/session";
import { clearRecipeStore } from "@/lib/recipeStore";
import { clearUserRecipeStore, getCachedUserRecipe } from "@/lib/userRecipeStore";
import { makeRecipe, makeUserRecipe } from "@/test/recipeFixtures";

jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
const mockPush = jest.fn();
const mockSetParams = jest.fn();
let mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, setParams: mockSetParams }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("@/context/ThemeContext", () => ({
  useAppTheme: () => ({ colors: new Proxy({}, { get: (_t, name) => `theme-${String(name)}` }) }),
}));
jest.mock("lucide-react-native", () => ({ ArrowUp: () => null, History: () => null, Plus: () => null }));
jest.mock("react-native-markdown-display", () => {
  const { Text: RNText } = jest.requireActual<typeof import("react-native")>("react-native");
  return { __esModule: true, default: ({ children }: { children: string }) => <RNText>{children}</RNText> };
});
jest.mock("@/lib/api/chat", () => ({
  ...jest.requireActual<typeof import("@/lib/api/chat")>("@/lib/api/chat"),
  getLatestConversation: jest.fn(),
  getConversation: jest.fn(),
  listConversations: jest.fn(),
  createConversation: jest.fn(),
  streamChat: jest.fn(),
}));
jest.mock("@/lib/api/myRecipes", () => ({ saveProposal: jest.fn(), fetchUserRecipe: jest.fn() }));
jest.mock("@/lib/api/recipes", () => ({
  ...jest.requireActual<typeof import("@/lib/api/recipes")>("@/lib/api/recipes"),
  fetchRecipe: jest.fn(),
}));

const mLatest = getLatestConversation as jest.MockedFunction<typeof getLatestConversation>;
const mConversation = getConversation as jest.MockedFunction<typeof getConversation>;
const mList = listConversations as jest.MockedFunction<typeof listConversations>;
const mCreate = createConversation as jest.MockedFunction<typeof createConversation>;
const mSave = saveProposal as jest.MockedFunction<typeof saveProposal>;
const mFetchRecipe = fetchRecipe as jest.MockedFunction<typeof fetchRecipe>;

type Proposal = NonNullable<ChatMessage["proposal"]>;
const proposal = (id: number, name: string, saved: number | null = null, extra: object = {}): Proposal => ({
  proposal_id: id,
  saved_recipe_id: saved,
  recipe: { name, method: "v60", steps: [{ action: "Verter" }], ...extra } as never,
});

beforeEach(async () => {
  await clearSession();
  mockParams = {};
  mockPush.mockReset();
  mockSetParams.mockReset();
  clearRecipeStore();
  clearUserRecipeStore();
  mLatest.mockReset().mockResolvedValue({ conversation_id: null, messages: [] });
  mConversation.mockReset();
  mList.mockReset();
  mCreate.mockReset();
  mSave.mockReset();
  mFetchRecipe.mockReset();
});

describe("RecipeProposalCard", () => {
  it("previews the recipe, plural 'more steps', and saves exactly once on a double press", async () => {
    let resolve!: (v: Awaited<ReturnType<typeof saveProposal>>) => void;
    mSave.mockReturnValue(new Promise((r) => (resolve = r)));
    const steps = [1, 2, 3, 4].map((n) => ({ action: `Paso ${n}` }));
    await render(<RecipeProposalCard proposal={proposal(5, "V60 dulce", null, { steps })} />);

    expect(screen.getByText("V60 dulce")).toBeTruthy();
    expect(screen.getByText("3. Paso 3")).toBeTruthy();
    expect(screen.queryByText("4. Paso 4")).toBeNull();
    expect(screen.getByText("y 1 paso más")).toBeTruthy();

    const button = screen.getByText(es.chat.proposal.save);
    await fireEvent.press(button);
    await fireEvent.press(screen.getByText(es.chat.proposal.saving));
    await fireEvent.press(screen.getByText(es.chat.proposal.saving));
    expect(mSave).toHaveBeenCalledTimes(1);
    expect(mSave).toHaveBeenCalledWith(5);

    await act(async () => resolve({ id: 30, recipe: makeUserRecipe(30) }));
    expect(screen.getByText(es.chat.proposal.saved)).toBeTruthy();
    expect(getCachedUserRecipe(30)).toBeDefined();

    await fireEvent.press(screen.getByText(es.chat.proposal.view));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/my-recipes/30");
  });

  it("never saves by itself, and renders a persisted saved_recipe_id as saved", async () => {
    await render(<RecipeProposalCard proposal={proposal(5, "A", 12)} />);
    expect(screen.getByText(es.chat.proposal.saved)).toBeTruthy();
    expect(screen.queryByText(es.chat.proposal.save)).toBeNull();
    expect(mSave).not.toHaveBeenCalled();
  });

  it("explains a 404 and keeps the button", async () => {
    const { AxiosError } = jest.requireActual<typeof import("axios")>("axios");
    mSave.mockRejectedValue(
      new AxiosError("x", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 404,
        statusText: "",
        data: {},
        headers: {},
        config: {} as never,
      }),
    );
    await render(<RecipeProposalCard proposal={proposal(5, "A")} />);
    await fireEvent.press(screen.getByText(es.chat.proposal.save));
    expect(await screen.findByText(es.chat.proposal.gone)).toBeTruthy();
    expect(screen.getByText(es.chat.proposal.save)).toBeTruthy();
  });
});

describe("saved state across remounts", () => {
  it("a card unmounted by list virtualization comes back as saved, until the session changes", async () => {
    mSave.mockResolvedValue({ id: 30, recipe: null });
    const first = await render(<RecipeProposalCard proposal={proposal(21, "A")} />);
    await fireEvent.press(screen.getByText(es.chat.proposal.save));
    expect(await screen.findByText(es.chat.proposal.saved)).toBeTruthy();
    await first.unmount();

    await render(<RecipeProposalCard proposal={proposal(21, "A")} />);
    expect(screen.getByText(es.chat.proposal.saved)).toBeTruthy();
    expect(screen.queryByText(es.chat.proposal.save)).toBeNull();
    expect(mSave).toHaveBeenCalledTimes(1);
  });
});

describe("CardErrorBoundary", () => {
  it("hides a card that throws while rendering and keeps its siblings", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const Boom = () => {
      throw new Error("boom");
    };
    await render(
      <>
        <CardErrorBoundary>
          <Boom />
        </CardErrorBoundary>
        <Text>hermano</Text>
      </>,
    );
    expect(screen.getByText("hermano")).toBeTruthy();
    jest.restoreAllMocks();
  });
});

describe("ChatScreen with the real hook", () => {
  const messages = (...ps: Proposal[]): ChatMessage[] =>
    ps.flatMap((p, i) => [
      { role: "user" as const, content: `pregunta ${i}` },
      { role: "assistant" as const, content: `respuesta ${i}`, proposal: p },
    ]);

  it("gives every proposal its card, and the chosen one saves with its own proposal_id", async () => {
    mLatest.mockResolvedValue({ conversation_id: 1, messages: messages(proposal(11, "Receta A"), proposal(12, "Receta B")) });
    mSave.mockResolvedValue({ id: 40, recipe: null });
    await render(<ChatScreen />);

    expect(await screen.findByText("Receta A")).toBeTruthy();
    expect(screen.getByText("Receta B")).toBeTruthy();
    const saves = screen.getAllByText(es.chat.proposal.save);
    expect(saves).toHaveLength(2);

    await fireEvent.press(saves[1]);
    await waitFor(() => expect(mSave).toHaveBeenCalledWith(12));
    expect(mSave).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText(es.chat.proposal.save)).toHaveLength(1);
  });

  it("does not crash on a proposal that reaches the card with unusable fields", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const bad = { proposal_id: 3, saved_recipe_id: null, recipe: null } as unknown as Proposal;
    mLatest.mockResolvedValue({ conversation_id: 1, messages: messages(bad, proposal(4, "Sana")) });
    await render(<ChatScreen />);
    expect(await screen.findByText("Sana")).toBeTruthy();
    expect(screen.getByText("respuesta 0")).toBeTruthy();
    jest.restoreAllMocks();
  });

  it("shows the banner for a recipe_ref loaded with ?c=, with the recipe name", async () => {
    mockParams = { c: "9" };
    mConversation.mockResolvedValue({ id: 9, messages: [], recipe_ref: { kind: "catalog", ref: "v60" } });
    mFetchRecipe.mockResolvedValue(makeRecipe("v60", { name: "V60 clásico" }));
    await render(<ChatScreen />);
    expect(await screen.findByText("Hablando sobre: V60 clásico")).toBeTruthy();
  });

  it("shows the banner for /latest too, with generic copy when the name cannot load", async () => {
    mLatest.mockResolvedValue({ conversation_id: 2, messages: [], recipe_ref: { kind: "catalog", ref: "gone" } });
    mFetchRecipe.mockRejectedValue(new Error("404"));
    await render(<ChatScreen />);
    expect(await screen.findByText(es.chat.talkingAboutGeneric)).toBeTruthy();
  });

  it("prefills the opening prompt in the input and does not send it", async () => {
    mockParams = { c: "9", intent: "ask" };
    mConversation.mockResolvedValue({ id: 9, messages: [], recipe_ref: { kind: "catalog", ref: "v60" } });
    mFetchRecipe.mockResolvedValue(makeRecipe("v60"));
    await render(<ChatScreen />);
    expect(await screen.findByDisplayValue(es.chat.intent.ask)).toBeTruthy();
  });

  it("shows no banner without a recipe_ref", async () => {
    await render(<ChatScreen />);
    await waitFor(() => expect(screen.queryAllByLabelText(es.common.loading)).toHaveLength(0));
    expect(screen.queryByText(es.chat.talkingAboutGeneric)).toBeNull();
  });
});
