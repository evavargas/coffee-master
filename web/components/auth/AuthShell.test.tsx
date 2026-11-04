import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { AuthShell } from "@/components/auth/AuthShell";
import es from "@/messages/es.json";

vi.mock("@/components/layout/AppControls", () => ({ AppControls: () => null }));

describe("AuthShell", () => {
  it("shows the app's name and subtitle above the page title", () => {
    render(
      <NextIntlClientProvider locale="es" messages={es}>
        <AuthShell title="Iniciar sesión">
          <p>Formulario</p>
        </AuthShell>
      </NextIntlClientProvider>,
    );

    const brand = screen.getByRole("heading", { name: "Coffee Master" });
    expect(screen.getByText(es.common.appSubtitle)).toBeInTheDocument();
    expect(brand.compareDocumentPosition(screen.getByText("Iniciar sesión"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
