import { describe, expect, it } from "vitest";
import { toVisibleHistory } from "@/lib/chat/history";
import { createMemoryStore } from "@/lib/chat/memory-store";
import { createNdjsonParser, encodeEvent } from "@/lib/chat/ndjson";

describe("memory store", () => {
  it("creates random uuids and round-trips messages, state, comparison and status", async () => {
    const store = createMemoryStore();
    const a = await store.create("app");
    const b = await store.create("e2e");
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);

    expect(await store.load(a)).toMatchObject({ id: a, status: "active", messages: [], state: { profile: {}, sources: {} } });
    await store.appendMessages(a, [{ message: { role: "user", content: "שלום" } }]);
    await store.saveState(a, { profile: { group: "ג" }, sources: { group: "employee" } });
    await store.setStatus(a, "waiting_rep");
    const q = await store.repQueue(a).ask({ question: "?", field: "current" });
    expect(q.status).toBe("open");

    const snap = (await store.load(a))!;
    expect(snap.messages).toHaveLength(1);
    expect(snap.state.profile.group).toBe("ג");
    expect(snap.status).toBe("waiting_rep");
    expect(await store.load("nope")).toBeNull();
  });
});

describe("toVisibleHistory", () => {
  it("keeps user text and final assistant replies, drops tool round-trips", () => {
    const visible = toVisibleHistory([
      { message: { role: "user", content: "שלום" } },
      { message: { role: "assistant", content: [{ type: "tool-call", toolCallId: "1", toolName: "getCatalog", input: {} }] } },
      { message: { role: "tool", content: [{ type: "tool-result", toolCallId: "1", toolName: "getCatalog", output: { type: "json", value: {} } }] } },
      { message: { role: "assistant", content: "היי!" }, meta: { notices: [], blocked: false } },
    ]);
    expect(visible).toEqual([
      { role: "user", text: "שלום" },
      { role: "assistant", text: "היי!", notices: [], blocked: false },
    ]);
  });
});

describe("ndjson", () => {
  it("parses events split across chunks", () => {
    const got: unknown[] = [];
    const p = createNdjsonParser((e) => got.push(e));
    const wire = encodeEvent({ type: "status", status: "thinking" }) + encodeEvent({ type: "result", reply: "שלום\nעולם" });
    p.push(wire.slice(0, 7));
    p.push(wire.slice(7, 30));
    p.push(wire.slice(30));
    p.flush();
    expect(got).toEqual([{ type: "status", status: "thinking" }, { type: "result", reply: "שלום\nעולם" }]);
  });

  it("flush handles a last line without a newline", () => {
    const got: unknown[] = [];
    const p = createNdjsonParser((e) => got.push(e));
    p.push('{"a":1}');
    p.flush();
    expect(got).toEqual([{ a: 1 }]);
  });
});
