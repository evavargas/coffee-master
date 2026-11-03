import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderHook, type RenderHookOptions, type RenderHookResult } from "@testing-library/react";

import esMessages from "@/messages/es.json";

/**
 * Renders a hook wrapped in the real `NextIntlClientProvider` with the real `es.json`
 * messages. Using the real messages (instead of mocking `useTranslations`) means a hook
 * that references a missing translation key fails the test, catching real regressions.
 */
export function renderHookWithIntl<Result, Props>(
  callback: (props: Props) => Result,
  options?: Omit<RenderHookOptions<Props>, "wrapper">,
): RenderHookResult<Result, Props> {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale="es" messages={esMessages}>
        {children}
      </NextIntlClientProvider>
    );
  }

  return renderHook(callback, { ...options, wrapper: Wrapper });
}
