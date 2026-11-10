import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import "@/i18n";
import { MyRecipesTabs } from "@/components/recipes/MyRecipesTabs";

jest.mock("@/context/ThemeContext", () => ({
  useAppTheme: () => ({ colors: new Proxy({}, { get: (_t, name) => `theme-${String(name)}` }) }),
}));

describe("MyRecipesTabs", () => {
  it("marks the active tab as selected and reports the chosen filter", async () => {
    const onChange = jest.fn();
    await render(<MyRecipesTabs value="favorites" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Favoritas" })).toBeSelected();
    expect(screen.getByRole("button", { name: "Todas" })).not.toBeSelected();
    await fireEvent.press(screen.getByRole("button", { name: "Creadas por mí" }));
    expect(onChange).toHaveBeenCalledWith("created");
    await fireEvent.press(screen.getByRole("button", { name: "Guardadas" }));
    expect(onChange).toHaveBeenLastCalledWith("saved");
  });
});
