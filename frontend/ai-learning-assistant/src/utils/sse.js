/**
 * Parses a `text/event-stream` body into `{ event, data }` frames as they
 * arrive. Hand-rolled (not EventSource) because EventSource can't POST or send
 * an Authorization header.
 */
export async function* parseSse(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        let event = "message";
        const dataLines = [];
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
        }
        if (dataLines.length) yield { event, data: JSON.parse(dataLines.join("\n")) };
      }
    }
  } finally {
    reader.releaseLock();
  }
}
