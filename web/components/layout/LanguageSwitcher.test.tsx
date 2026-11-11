import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import en from "@/messages/en.json";
import es from "@/messages/es.json";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const renderIn = (locale: "es" | "en", messages: typeof es) =>
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LanguageSwitcher />
    </NextIntlClientProvider>,
  );

describe("LanguageSwitcher", () => {
  afterEach(() => {
    cleanup();
    refresh.mockReset();
  });

  it("shows the current language, not the one it switches to", () => {
    renderIn("es", es);
    expect(screen.getByRole("button", { name: "Cambiar idioma" })).toHaveTextContent("ES");
    cleanup();
    renderIn("en", en as typeof es);
    expect(screen.getByRole("button")).toHaveTextContent("EN");
  });

  it("switches to the other language on click", () => {
    renderIn("es", es);
    fireEvent.click(screen.getByRole("button"));
    expect(document.cookie).toContain("=en");
    expect(refresh).toHaveBeenCalled();
  });
});
