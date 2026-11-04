"use client";

import { useEffect, useRef } from "react";

/**
 * Grows a textarea with its content until `maxHeightPx`, then scrolls inside it.
 * Returns the ref to attach to the textarea.
 */
export function useAutoResizeTextarea(value: string, maxHeightPx = 160) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // Reset first so the height can also shrink after the text is deleted or sent.
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, maxHeightPx)}px`;
    element.style.overflowY = element.scrollHeight > maxHeightPx ? "auto" : "hidden";
  }, [value, maxHeightPx]);

  return ref;
}
