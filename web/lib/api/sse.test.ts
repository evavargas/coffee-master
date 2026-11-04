import { describe, expect, it } from "vitest";

import { SseParser } from "@/lib/api/sse";

describe("SseParser", () => {
  it("parses several events in one chunk", () => {
    const parser = new SseParser();
    const out = parser.push('event: start\ndata: {"conversation_id":1}\n\nevent: delta\ndata: {"text":"Hi"}\n\n');
    expect(out).toEqual([
      { event: "start", data: '{"conversation_id":1}' },
      { event: "delta", data: '{"text":"Hi"}' },
    ]);
  });

  it("returns nothing until the event is complete, whatever the split point", () => {
    const raw = 'event: delta\ndata: {"text":"Hola"}\n\nevent: done\ndata: {}\n\n';
    for (let cut = 0; cut <= raw.length; cut++) {
      const parser = new SseParser();
      const out = [...parser.push(raw.slice(0, cut)), ...parser.push(raw.slice(cut))];
      expect(out).toEqual([
        { event: "delta", data: '{"text":"Hola"}' },
        { event: "done", data: "{}" },
      ]);
    }
  });

  it("works one character at a time", () => {
    const raw = "event: a\ndata: 1\n\nevent: b\ndata: 2\n\n";
    const parser = new SseParser();
    const out = [...raw].flatMap((ch) => parser.push(ch));
    expect(out.map((m) => m.event)).toEqual(["a", "b"]);
  });

  it("handles CRLF, including a CRLF split between chunks", () => {
    const parser = new SseParser();
    const out = [
      ...parser.push("event: delta\r\ndata: x\r"),
      ...parser.push("\n\r"),
      ...parser.push("\n"),
    ];
    expect(out).toEqual([{ event: "delta", data: "x" }]);
  });

  it("ignores comments and joins multi-line data", () => {
    const parser = new SseParser();
    const out = parser.push(": keep-alive\n\nevent: delta\ndata: a\ndata: b\n\n");
    expect(out).toEqual([{ event: "delta", data: "a\nb" }]);
  });

  it("keeps an incomplete trailing event buffered", () => {
    const parser = new SseParser();
    expect(parser.push("event: delta\ndata: partial")).toEqual([]);
    expect(parser.push('\n\n')).toEqual([{ event: "delta", data: "partial" }]);
  });
});
