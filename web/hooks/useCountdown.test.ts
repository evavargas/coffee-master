import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCountdown } from "@/hooks/useCountdown";

describe("useCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at the given total and formats as mm:ss", () => {
    const { result } = renderHook(() => useCountdown(90));

    expect(result.current.secondsLeft).toBe(90);
    expect(result.current.formatted).toBe("01:30");
    expect(result.current.isExpired).toBe(false);
  });

  it("ticks down once per second", () => {
    const { result } = renderHook(() => useCountdown(5));

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.secondsLeft).toBe(2);
    expect(result.current.formatted).toBe("00:02");
  });

  it("stops at zero and reports expired", () => {
    const { result } = renderHook(() => useCountdown(2));

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.secondsLeft).toBe(0);
    expect(result.current.formatted).toBe("00:00");
    expect(result.current.isExpired).toBe(true);
  });

  it("restart resets the countdown back to the total", () => {
    const { result } = renderHook(() => useCountdown(10));

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.secondsLeft).toBe(6);

    act(() => {
      result.current.restart();
    });
    expect(result.current.secondsLeft).toBe(10);
    expect(result.current.isExpired).toBe(false);
  });
});
