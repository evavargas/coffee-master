import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppLayout from "@/app/(app)/layout";
import es from "@/messages/es.json";
import { getToken, saveToken } from "@/lib/session";

const replace = vi.fn();
let pathname = "/chat";
let auth: { user: { name: string } | null; isLoading: boolean } = { user: null, isLoading: false };

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }), usePathname: () => pathname }));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => auth }));
vi.mock("@/components/layout/AppControls", () => ({ AppControls: () => null }));
vi.mock("@/hooks/useConversations", () => ({
  useConversations: () => ({ items: [], isLoading: false, error: null, createError: null, isCreating: false, hasMore: false, loadMore: vi.fn(), retry: vi.fn(), startNew: vi.fn() }),
}));

function renderLayout() {
  return render(
    <NextIntlClientProvider locale="es" messages={es}>
      <AppLayout>
        <p>contenido</p>
      </AppLayout>
    </NextIntlClientProvider>,
  );
}

describe("AppLayout", () => {
  afterEach(cleanup);

  beforeEach(() => {
    replace.mockClear();
    pathname = "/chat";
    auth = { user: null, isLoading: false };
  });

  it("redirects to /login without a session and hides the content", () => {
    renderLayout();
    expect(replace).toHaveBeenCalledWith("/login");
    expect(screen.queryByText("contenido")).not.toBeInTheDocument();
  });

  it("shows only the loading state, without redirecting, while loading", () => {
    auth = { user: null, isLoading: true };
    renderLayout();
    expect(screen.getByRole("status")).toHaveTextContent(es.common.loading);
    expect(screen.queryByText("contenido")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("marks /recipes active on nested paths and not /my-recipes", () => {
    auth = { user: { name: "Ana" }, isLoading: false };
    pathname = "/recipes/123";
    renderLayout();
    expect(screen.getByRole("link", { name: "Recetas" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Mis recetas" })).not.toHaveAttribute("aria-current");
  });

  it("marks only the active nav link with aria-current", () => {
    auth = { user: { name: "Ana" }, isLoading: false };
    pathname = "/my-recipes";
    renderLayout();
    expect(screen.getByRole("navigation", { name: es.nav.ariaLabel })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mis recetas" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Recetas" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Chat" })).not.toHaveAttribute("aria-current");
  });

  it("sign out clears the session and goes to login", () => {
    auth = { user: { name: "Ana" }, isLoading: false };
    saveToken("t");
    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(getToken()).toBeNull();
    expect(replace).toHaveBeenCalledWith("/login");
  });
});
