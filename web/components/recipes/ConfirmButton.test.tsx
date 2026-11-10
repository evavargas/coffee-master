import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfirmButton } from "@/components/recipes/ConfirmButton";
import es from "@/messages/es.json";

const wrap = (onConfirm = vi.fn()) =>
  render(
    <NextIntlClientProvider locale="es" messages={es}>
      <ConfirmButton label="Eliminar" message="¿Seguro?" onConfirm={onConfirm} />
    </NextIntlClientProvider>,
  );

describe("ConfirmButton", () => {
  afterEach(cleanup);

  it("focuses the confirm action, Escape cancels and focus returns to the trigger", () => {
    const onConfirm = vi.fn();
    wrap(onConfirm);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(screen.getByRole("button", { name: "Sí, confirmar" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(screen.getByRole("button", { name: "Eliminar" })).toHaveFocus();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms once", () => {
    const onConfirm = vi.fn();
    wrap(onConfirm);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, confirmar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
