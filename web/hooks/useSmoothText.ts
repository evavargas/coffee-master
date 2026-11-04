"use client";

import { useEffect, useRef, useState } from "react";

/** Roughly 30 updates per second: smooth to the eye, and light on the Markdown rendering. */
const FRAME_INTERVAL_MS = 33;
/** How fast the pending text drains. Longer feels calmer, but trails further behind the stream. */
const CATCH_UP_MS = 400;

const HIGH_SURROGATE_START = 0xd800;
const HIGH_SURROGATE_END = 0xdbff;

/**
 * How many characters of `target` to show after `elapsedMs`. It reveals a share of what is pending,
 * so it speeds up when a burst arrives and slows down as it catches up.
 */
export function nextRevealLength(shownLength: number, target: string, elapsedMs: number): number {
  const pending = target.length - shownLength;
  if (pending <= 0) return target.length;

  const step = Math.max(1, Math.ceil((pending * elapsedMs) / CATCH_UP_MS));
  const length = Math.min(target.length, shownLength + step);

  // Never cut an emoji in half.
  const lastCode = target.charCodeAt(length - 1);
  const endsInsidePair = lastCode >= HIGH_SURROGATE_START && lastCode <= HIGH_SURROGATE_END;
  return endsInsidePair ? Math.min(target.length, length + 1) : length;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Reveals text gradually. The stream reaches the browser in bursts about 330 ms apart (axios
 * throttles download progress), so showing `target` as is would look like hard jumps.
 *
 * With `animateFromStart` the text starts empty; otherwise, as with stored messages, it starts
 * complete. A `target` that does not continue the shown text (a `replace` event) is shown at once.
 */
export function useSmoothText(target: string, { animateFromStart = false } = {}): string {
  const [shown, setShown] = useState(animateFromStart ? "" : target);
  const shownRef = useRef(shown);
  const lastFrameRef = useRef<number | null>(null);

  useEffect(() => {
    function reveal(text: string) {
      shownRef.current = text;
      setShown(text);
    }

    if (shownRef.current === target) return;
    if (!target.startsWith(shownRef.current) || prefersReducedMotion()) {
      reveal(target);
      return;
    }

    let frame: number;
    function step(now: number) {
      const elapsed = now - (lastFrameRef.current ?? now - FRAME_INTERVAL_MS);
      if (elapsed >= FRAME_INTERVAL_MS) {
        lastFrameRef.current = now;
        reveal(target.slice(0, nextRevealLength(shownRef.current.length, target, elapsed)));
      }
      if (shownRef.current === target) {
        // Idle time until the next burst must not count as elapsed, or that burst would jump.
        lastFrameRef.current = null;
      } else {
        frame = requestAnimationFrame(step);
      }
    }
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return shown;
}
