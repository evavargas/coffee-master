export type SseMessage = { event: string; data: string };

/**
 * Incremental Server-Sent Events parser. Feed it text chunks split at any boundary
 * (mid-line, mid-event, between "\r" and "\n"); it returns only the events completed so far.
 * Pure: no I/O, no timers.
 */
export class SseParser {
  private buffer = "";

  push(chunk: string): SseMessage[] {
    this.buffer += chunk;

    // Normalize line endings, but keep a trailing "\r": its "\n" may arrive in the next chunk.
    const heldCr = this.buffer.endsWith("\r") ? "\r" : "";
    const text = (heldCr ? this.buffer.slice(0, -1) : this.buffer).replace(/\r\n?/g, "\n");

    const blocks = text.split("\n\n");
    // The last block is an unfinished event (or empty string); keep it for the next chunk.
    this.buffer = (blocks.pop() ?? "") + heldCr;

    const messages: SseMessage[] = [];
    for (const block of blocks) {
      const message = parseBlock(block);
      if (message) messages.push(message);
    }
    return messages;
  }
}

function parseBlock(block: string): SseMessage | null {
  let event = "message";
  const data: string[] = [];

  for (const line of block.split("\n")) {
    if (line === "" || line.startsWith(":")) continue; // blank line or comment (keep-alive)
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }

  return data.length === 0 ? null : { event, data: data.join("\n") };
}
