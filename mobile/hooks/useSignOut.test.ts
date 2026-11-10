import { renderHook } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { useSignOut } from "@/hooks/useSignOut";

const mockReplace = jest.fn();
const mockSignOut = jest.fn<() => Promise<void>>();

jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock("@/context/SessionContext", () => ({ useSessionContext: () => ({ signOut: mockSignOut }) }));

describe("useSignOut", () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockSignOut.mockReset().mockResolvedValue(undefined);
  });

  it("clears the session and navigates to login", async () => {
    const { result } = await renderHook(() => useSignOut());
    await result.current();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });
});
