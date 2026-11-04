import { act, renderHook } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { AccessibilityInfo } from "react-native";

import { nextRevealLength, useSmoothText } from "@/hooks/useSmoothText";

const FRAME_MS = 50;

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
  let callbacks: ((time: number) => void)[] = [];
  let now = 0;
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;

  async function runFrames(count: number) {
    for (let i = 0; i < count; i += 1) {
      now += FRAME_MS;
      const pending = callbacks;
      callbacks = [];
      await act(async () => pending.forEach((callback) => callback(now)));
    }
  }

  beforeEach(() => {
    callbacks = [];
    now = 0;
    globalThis.requestAnimationFrame = ((callback: (time: number) => void) => callbacks.push(callback)) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {
      callbacks = [];
    }) as typeof cancelAnimationFrame;
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
    jest.restoreAllMocks();
  });

  it("shows stored messages complete right away", async () => {
    const { result } = await renderHook(() => useSmoothText("guardado"));
    expect(result.current).toBe("guardado");
    expect(callbacks).toHaveLength(0);
  });

  it("reveals a streamed burst gradually, without large jumps, until it is complete", async () => {
    const text = "x".repeat(200);
    const { result } = await renderHook(() => useSmoothText(text, { animateFromStart: true }));
    expect(result.current).toBe("");

    let previous = 0;
    for (let i = 0; i < 200 && result.current !== text; i += 1) {
      await runFrames(1);
      const growth = result.current.length - previous;
      expect(growth).toBeGreaterThan(0);
      expect(growth).toBeLessThan(40);
      previous = result.current.length;
    }
    expect(result.current).toBe(text);
  });

  it("does not jump on a burst that arrives after an idle pause", async () => {
    const { result, rerender } = await renderHook(
      ({ text }: { text: string }) => useSmoothText(text, { animateFromStart: true }),
      { initialProps: { text: "hola" } },
    );
    await runFrames(50);
    expect(result.current).toBe("hola");

    now += 5000; // Idle: the model paused between bursts.
    const next = `hola${"x".repeat(200)}`;
    await rerender({ text: next });
    await runFrames(1);

    expect(next.startsWith(result.current)).toBe(true);
    expect(result.current.length - 4).toBeLessThan(40);
  });

  it("shows a replacement at once", async () => {
    const { result, rerender } = await renderHook(
      ({ text }: { text: string }) => useSmoothText(text, { animateFromStart: true }),
      { initialProps: { text: "parte de una respuesta" } },
    );
    await runFrames(3);

    await rerender({ text: "Mensaje de reemplazo" });
    expect(result.current).toBe("Mensaje de reemplazo");
  });

  it("respects the reduce motion setting", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    const { result } = await renderHook(() => useSmoothText("sin animación", { animateFromStart: true }));
    await act(async () => {});
    expect(result.current).toBe("sin animación");
  });

  it("stops scheduling frames after unmounting", async () => {
    const { unmount } = await renderHook(() => useSmoothText("x".repeat(100), { animateFromStart: true }));
    expect(callbacks.length).toBeGreaterThan(0);
    await unmount();
    expect(callbacks).toHaveLength(0);
  });
});
