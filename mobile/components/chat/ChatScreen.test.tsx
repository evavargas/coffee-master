import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// Side-effect import: initializes the i18next singleton so `t()` resolves
// real translations instead of echoing the raw key.
import "@/i18n";
import { ChatScreen } from "@/components/chat/ChatScreen";
import { useChat } from "@/hooks/useChat";
import es from "@/i18n/locales/es.json";

jest.mock("@/hooks/useChat");
jest.mock("@/context/ThemeContext", () => ({
  useAppTheme: () => ({
    colors: new Proxy({}, { get: (_target, name) => `theme-${String(name)}` }),
  }),
}));
jest.mock("lucide-react-native", () => ({ ArrowUp: () => null, SquarePen: () => null }));
jest.mock("react-native-markdown-display", () => {
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return { __esModule: true, default: ({ children }: { children: string }) => <Text>{children}</Text> };
});

const mockedUseChat = useChat as jest.MockedFunction<typeof useChat>;

type ChatState = ReturnType<typeof useChat>;

function chatState(overrides: Partial<ChatState> = {}): ChatState {
  return {
    messages: [],
    conversationId: null,
    input: "",
    setInput: jest.fn(),
    isLoadingHistory: false,
    isLoading: false,
    isAwaitingFirstDelta: false,
    canStartNewConversation: true,
    error: null,
    send: jest.fn<ChatState["send"]>(),
    newConversation: jest.fn(),
    ...overrides,
  };
}

const spinners = () => screen.queryAllByLabelText(es.common.loading).length;

describe("ChatScreen", () => {
  beforeEach(() => {
    mockedUseChat.mockReset();
  });

  it("shows a loader instead of the suggestions while the history loads", async () => {
    mockedUseChat.mockReturnValue(chatState({ isLoadingHistory: true, canStartNewConversation: false }));
    await render(<ChatScreen />);

    expect(spinners()).toBe(1);
    expect(screen.queryByText(es.chat.suggestions.cappuccino)).toBeNull();
  });

  it("shows the suggestions for an empty conversation", async () => {
    const state = chatState();
    mockedUseChat.mockReturnValue(state);
    await render(<ChatScreen />);

    await fireEvent.press(screen.getByText(es.chat.suggestions.cappuccino));
    expect(state.send).toHaveBeenCalledWith(es.chat.suggestions.cappuccino);
  });

  it("shows loading indicators until the first delta, and none after it", async () => {
    mockedUseChat.mockReturnValue(
      chatState({
        messages: [
          { role: "user", content: "Hola" },
          { role: "assistant", content: "" },
        ],
        isLoading: true,
        isAwaitingFirstDelta: true,
      }),
    );
    const { rerender } = await render(<ChatScreen />);
    expect(spinners()).toBe(2);

    mockedUseChat.mockReturnValue(
      chatState({
        messages: [
          { role: "user", content: "Hola" },
          { role: "assistant", content: "Un cortado" },
        ],
        isLoading: true,
      }),
    );
    await rerender(<ChatScreen />);
    expect(spinners()).toBe(0);
    expect(screen.getByText("Un cortado")).toBeTruthy();
  });

  it("disables the new conversation control while sending", async () => {
    const state = chatState({ canStartNewConversation: false, isLoading: true });
    mockedUseChat.mockReturnValue(state);
    await render(<ChatScreen />);

    await fireEvent.press(screen.getByText(es.chat.newConversation));
    expect(state.newConversation).not.toHaveBeenCalled();
  });

  it("starts a new conversation from the control", async () => {
    const state = chatState();
    mockedUseChat.mockReturnValue(state);
    await render(<ChatScreen />);

    await fireEvent.press(screen.getByText(es.chat.newConversation));
    expect(state.newConversation).toHaveBeenCalledTimes(1);
  });

  it("shows the restored input and the error after a failure", async () => {
    mockedUseChat.mockReturnValue(chatState({ input: "¿Cómo hago un cortado?", error: es.chat.errors.modelBusy }));
    await render(<ChatScreen />);

    expect(screen.getByDisplayValue("¿Cómo hago un cortado?")).toBeTruthy();
    expect(screen.getByText(es.chat.errors.modelBusy)).toBeTruthy();
  });
});
