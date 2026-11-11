import { fireEvent, render, screen } from "@testing-library/react-native";
import { useForm } from "react-hook-form";
import { describe, expect, it, jest } from "@jest/globals";
import { StyleSheet } from "react-native";

import "@/i18n";
import { FormField } from "@/components/auth/FormField";

jest.mock("lucide-react-native", () => ({ Eye: () => null, EyeOff: () => null }));
jest.mock("@/context/ThemeContext", () => ({
  useAppTheme: () => ({ colors: new Proxy({}, { get: (_t, name) => `theme-${String(name)}` }) }),
}));

function Harness({ multiline, secure, revealable }: { multiline?: boolean; secure?: boolean; revealable?: boolean }) {
  const { control } = useForm<{ a: string }>({ defaultValues: { a: "" } });
  return <FormField control={control} name="a" label="Campo" multiline={multiline} secureTextEntry={secure} revealable={revealable} />;
}

const flat = () => StyleSheet.flatten(screen.getByLabelText("Campo").props.style);

describe("FormField", () => {
  it("keeps the original single-line height", async () => {
    await render(<Harness />);
    expect(flat().minHeight).toBeUndefined();
  });
  it("gives multiline inputs a taller, top-aligned box", async () => {
    await render(<Harness multiline />);
    expect(flat()).toMatchObject({ minHeight: 96, textAlignVertical: "top" });
  });
  it("shows and hides a revealable password with the eye button", async () => {
    await render(<Harness secure revealable />);
    expect(screen.getByLabelText("Campo").props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByLabelText("Mostrar contraseña"));
    expect(screen.getByLabelText("Campo").props.secureTextEntry).toBe(false);
    await fireEvent.press(screen.getByLabelText("Ocultar contraseña"));
    expect(screen.getByLabelText("Campo").props.secureTextEntry).toBe(true);
  });
  it("has no eye button unless asked", async () => {
    await render(<Harness secure />);
    expect(screen.queryByLabelText("Mostrar contraseña")).toBeNull();
  });
});
