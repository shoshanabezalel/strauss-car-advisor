/** Newline-delimited JSON, used by POST /api/chat. Browser-safe. */

export function encodeEvent(e: unknown): string {
  return `${JSON.stringify(e)}\n`; // JSON.stringify escapes newlines inside strings, so one event = one line
}

/** Feed it text chunks as they arrive; it calls `onEvent` for every complete line. `flush` handles a last line without "\n". */
export function createNdjsonParser<T>(onEvent: (e: T) => void): { push(chunk: string): void; flush(): void } {
  let buffer = "";
  const emit = (line: string) => {
    if (line.trim()) onEvent(JSON.parse(line) as T);
  };
  return {
    push(chunk) {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(emit);
    },
    flush() {
      emit(buffer);
      buffer = "";
    },
  };
}
