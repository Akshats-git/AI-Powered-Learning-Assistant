import { describe, it, expect } from "vitest";
import { parseSse } from "./sse";

const streamOf = (chunks) =>
  new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });

const collect = async (body) => {
  const out = [];
  for await (const f of parseSse(body)) out.push(f);
  return out;
};

describe("parseSse", () => {
  it("parses event/data frames", async () => {
    const frames = await collect(streamOf(['event: token\ndata: {"text":"Hi"}\n\n', 'event: done\ndata: {"ok":true}\n\n']));
    expect(frames).toEqual([{ event: "token", data: { text: "Hi" } }, { event: "done", data: { ok: true } }]);
  });

  it("reassembles a frame split across network chunks, even mid-multibyte-character", async () => {
    const enc = new TextEncoder();
    const bytes = enc.encode('event: token\ndata: {"text":"héllo"}\n\n');
    const cut = bytes.indexOf(0xc3) + 1; // split the two bytes of "é"
    const body = new ReadableStream({
      start(c) {
        c.enqueue(bytes.slice(0, cut));
        c.enqueue(bytes.slice(cut));
        c.close();
      },
    });
    expect(await collect(body)).toEqual([{ event: "token", data: { text: "héllo" } }]);
  });

  it("handles several frames arriving in one chunk", async () => {
    const frames = await collect(streamOf(['event: a\ndata: {"n":1}\n\nevent: b\ndata: {"n":2}\n\n']));
    expect(frames.map((f) => f.event)).toEqual(["a", "b"]);
  });

  it("ignores an incomplete trailing frame and comment lines", async () => {
    const frames = await collect(streamOf([': keep-alive\n\nevent: a\ndata: {"n":1}\n\nevent: b\ndata: {"n"']));
    expect(frames).toEqual([{ event: "a", data: { n: 1 } }]);
  });
});
