import "@testing-library/jest-dom/vitest";

// jsdom lacks these browser APIs, which Radix Select calls when opening and choosing an option.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;
Element.prototype.scrollIntoView ??= () => undefined;
