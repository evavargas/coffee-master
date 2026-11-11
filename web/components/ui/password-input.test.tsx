import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";

import { PasswordInput } from "@/components/ui/password-input";
import es from "@/messages/es.json";

describe("PasswordInput", () => {
  afterEach(cleanup);

  it("hides the text by default and shows or hides it with the eye button", () => {
    render(
      <NextIntlClientProvider locale="es" messages={es}>
        <PasswordInput aria-label="Clave" defaultValue="secreto" />
      </NextIntlClientProvider>,
    );
    const input = screen.getByLabelText("Clave");
    expect(input).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Ocultar contraseña" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Ocultar contraseña" }));
    expect(input).toHaveAttribute("type", "password");
  });
});
