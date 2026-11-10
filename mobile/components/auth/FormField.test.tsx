import { render, screen } from "@testing-library/react-native";
import { useForm } from "react-hook-form";
import { describe, expect, it, jest } from "@jest/globals";
import { StyleSheet } from "react-native";

import { FormField } from "@/components/auth/FormField";

jest.mock("@/context/ThemeContext", () => ({
  useAppTheme: () => ({ colors: new Proxy({}, { get: (_t, name) => `theme-${String(name)}` }) }),
}));

function Harness({ multiline }: { multiline?: boolean }) {
  const { control } = useForm<{ a: string }>({ defaultValues: { a: "" } });
  return <FormField control={control} name="a" label="Campo" multiline={multiline} />;
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
});
