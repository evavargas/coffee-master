import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import "@/i18n";
import { ConfirmButton } from "@/components/recipes/ConfirmButton";

jest.mock("@/context/ThemeContext", () => ({
  useAppTheme: () => ({ colors: new Proxy({}, { get: (_t, name) => `theme-${String(name)}` }) }),
}));

describe("ConfirmButton", () => {
  it("asks in-screen first and only then confirms", async () => {
    const onConfirm = jest.fn();
    await render(<ConfirmButton label="Eliminar" message="¿Seguro?" onConfirm={onConfirm} />);
    await fireEvent.press(screen.getByRole("button", { name: "Eliminar" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText("¿Seguro?")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Sí, confirmar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("¿Seguro?")).toBeNull();
  });

  it("cancel goes back to the trigger without confirming", async () => {
    const onConfirm = jest.fn();
    await render(<ConfirmButton label="Eliminar" message="¿Seguro?" onConfirm={onConfirm} />);
    await fireEvent.press(screen.getByRole("button", { name: "Eliminar" }));
    await fireEvent.press(screen.getByRole("button", { name: "Cancelar" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeTruthy();
  });
});
