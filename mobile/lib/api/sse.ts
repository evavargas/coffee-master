export interface SseEvent {
  event: string;
  data: string;
}

const DEFAULT_EVENT_NAME = "message";

/**
 * Incremental Server-Sent Events parser. Network chunks can split an event, or a
 * line terminator, at any byte, so unfinished input stays buffered until the next
 * `feed`. An event only counts once its closing blank line has arrived.
 */
export function createSseParser() {
  let buffer = "";
  let eventName = DEFAULT_EVENT_NAME;
  let dataLines: string[] = [];

  function readLine(line: string, events: SseEvent[]) {
    if (line === "") {
      if (dataLines.length > 0) {
        events.push({ event: eventName, data: dataLines.join("\n") });
      }
      eventName = DEFAULT_EVENT_NAME;
      dataLines = [];
      return;
    }

    const colon = line.indexOf(":");
    // A leading colon is an SSE comment, which proxies use as a keep-alive.
    if (colon === 0) return;

    const field = colon === -1 ? line : line.slice(0, colon);
    const rawValue = colon === -1 ? "" : line.slice(colon + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;

    if (field === "event") eventName = value;
    if (field === "data") dataLines.push(value);
  }

  function feed(chunk: string): SseEvent[] {
    buffer += chunk;
    const events: SseEvent[] = [];
    let lineStart = 0;

    for (let index = 0; index < buffer.length; index += 1) {
      const char = buffer[index];
      if (char !== "\n" && char !== "\r") continue;
      // A trailing \r may be half of a \r\n whose \n is in the next chunk.
      if (char === "\r" && index === buffer.length - 1) break;

      readLine(buffer.slice(lineStart, index), events);
      if (char === "\r" && buffer[index + 1] === "\n") index += 1;
      lineStart = index + 1;
    }

    buffer = buffer.slice(lineStart);
    return events;
  }

  return { feed };
}
