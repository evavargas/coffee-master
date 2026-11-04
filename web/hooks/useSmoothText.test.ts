import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { nextRevealLength, useSmoothText } from "@/hooks/useSmoothText";

const FRAME_MS = 33;

describe("nextRevealLength", () => {
  it("reveals more when more text is pending, and at least one character", () => {
    const long = "x".repeat(400);
    expect(nextRevealLength(0, long, FRAME_MS)).toBeGreaterThan(nextRevealLength(390, long, FRAME_MS) - 390);
    expect(nextRevealLength(399, long, 1)).toBe(400);
  });

  it("never stops in the middle of an emoji", () => {
    expect(nextRevealLength(1, "a☕b😀", 1)).toBe(2);
    expect(nextRevealLength(3, "a☕b😀", 1)).toBe(5);
  });
});

describe("useSmoothText", () => {
  let callbacks: FrameRequestCallback[] = [];
  let now = 0;

  function runFrames(count: number) {
    for (let i = 0; i < count; i += 1) {
      now += FRAME_MS;
      const pending = callbacks;
      callbacks = [];
      act(() => pending.forEach((callback) => callback(now)));
    }
  }

  beforeEach(() => {
    callbacks = [];
    now = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => callbacks.push(callback));
    vi.stubGlobal("cancelAnimationFrame", () => {
      callbacks = [];
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows stored messages complete right away", () => {
    const { result } = renderHook(() => useSmoothText("guardado"));
    expect(result.current).toBe("guardado");
    expect(callbacks).toHaveLength(0);
  });

  it("reveals a streamed burst gradually, without large jumps, until it is complete", () => {
    const text = "x".repeat(200);
    const { result } = renderHook(() => useSmoothText(text, { animateFromStart: true }));
    expect(result.current).toBe("");

    let previous = 0;
    for (let i = 0; i < 200 && result.current !== text; i += 1) {
      runFrames(1);
      const growth = result.current.length - previous;
      expect(growth).toBeGreaterThan(0);
      expect(growth).toBeLessThan(40);
      previous = result.current.length;
    }
    expect(result.current).toBe(text);
  });

  it("does not jump on a burst that arrives after an idle pause", () => {
    const { result, rerender } = renderHook(({ text }) => useSmoothText(text, { animateFromStart: true }), {
      initialProps: { text: "hola" },
    });
    runFrames(50);
    expect(result.current).toBe("hola");

    now += 5000; // Idle: the model paused between bursts.
    const next = `hola${"x".repeat(200)}`;
    rerender({ text: next });
    runFrames(1);

    expect(next.startsWith(result.current)).toBe(true);
    expect(result.current.length - 4).toBeLessThan(40);
  });

  it("keeps revealing from where it was when more text arrives", () => {
    const { result, rerender } = renderHook(({ text }) => useSmoothText(text, { animateFromStart: true }), {
      initialProps: { text: "x".repeat(100) },
    });
    runFrames(2);
    const before = result.current.length;
    expect(before).toBeGreaterThan(0);

    rerender({ text: "x".repeat(300) });
    runFrames(1);
    expect(result.current.length).toBeGreaterThan(before);
  });

  it("shows a replacement at once", () => {
    const { result, rerender } = renderHook(({ text }) => useSmoothText(text, { animateFromStart: true }), {
      initialProps: { text: "parte de una respuesta" },
    });
    runFrames(3);

    rerender({ text: "Mensaje de reemplazo" });
    expect(result.current).toBe("Mensaje de reemplazo");
  });

  it("respects the reduced motion preference", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { result } = renderHook(() => useSmoothText("sin animación", { animateFromStart: true }));
    expect(result.current).toBe("sin animación");
  });

  it("stops scheduling frames after unmounting", () => {
    const { unmount } = renderHook(() => useSmoothText("x".repeat(100), { animateFromStart: true }));
    expect(callbacks.length).toBeGreaterThan(0);
    unmount();
    expect(callbacks).toHaveLength(0);
  });
});
