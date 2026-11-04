import { describe, expect, it } from "@jest/globals";

import { createSseParser, type SseEvent } from "@/lib/api/sse";

const STREAM =
  'event: start\ndata: {"conversation_id": 7}\n\n' +
  'event: delta\ndata: {"text": "Hola Ana, ñandú ☕"}\n\n' +
  "event: done\ndata: {}\n\n";

const EXPECTED: SseEvent[] = [
  { event: "start", data: '{"conversation_id": 7}' },
  { event: "delta", data: '{"text": "Hola Ana, ñandú ☕"}' },
  { event: "done", data: "{}" },
];

describe("createSseParser", () => {
  it("returns every event of a single chunk, in order", () => {
    expect(createSseParser().feed(STREAM)).toEqual(EXPECTED);
  });

  it("gives the same events for a split at every possible position", () => {
    for (let split = 0; split <= STREAM.length; split += 1) {
      const parser = createSseParser();
      const events = [...parser.feed(STREAM.slice(0, split)), ...parser.feed(STREAM.slice(split))];
      expect(events).toEqual(EXPECTED);
    }
  });

  it("gives the same events when fed one character at a time", () => {
    const parser = createSseParser();
    expect([...STREAM].flatMap((char) => parser.feed(char))).toEqual(EXPECTED);
  });

  it("holds back an event until its closing blank line arrives", () => {
    const parser = createSseParser();
    expect(parser.feed('event: delta\ndata: {"text": "a"}\n')).toEqual([]);
    expect(parser.feed("\n")).toEqual([{ event: "delta", data: '{"text": "a"}' }]);
  });

  it("accepts CRLF line endings, including a split between CR and LF", () => {
    const crlf = STREAM.replaceAll("\n", "\r\n");
    for (let split = 0; split <= crlf.length; split += 1) {
      const parser = createSseParser();
      expect([...parser.feed(crlf.slice(0, split)), ...parser.feed(crlf.slice(split))]).toEqual(EXPECTED);
    }
  });

  it("ignores comments and joins multi-line data", () => {
    const parser = createSseParser();
    expect(parser.feed(": keep-alive\n\nevent: delta\ndata: a\ndata: b\n\n")).toEqual([
      { event: "delta", data: "a\nb" },
    ]);
  });

  it("does not leak the event name into the next event", () => {
    const parser = createSseParser();
    expect(parser.feed("event: delta\n\ndata: x\n\n")).toEqual([{ event: "message", data: "x" }]);
  });
});
