import { readChatStream } from "@/lib/chat-stream";

function createStreamResponse(chunks: string[]) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }

      controller.close();
    },
  });

  return new Response(stream);
}

describe("readChatStream", () => {
  test("parses fragmented SSE events and preserves streamed chunks", async () => {
    const response = createStreamResponse([
      "event: meta\ndata: {\"citations\":[{\"document_id\":\"doc-1\",\"filename\":\"report.txt\"}],\"grounded\":true,\"notInKnowledgeBase\":false,\"retrieval_method\":\"vector\"}\n\n",
      "event: delta\ndata: {\"chunk\":\"Hel",
      "lo\"}\n\n",
      "event: delta\ndata: {\"chunk\":\" world\"}\n\n",
      "event: done\ndata: {\"success\":true,\"answer\":\"Hello world\",\"citations\":[],\"grounded\":true,\"notInKnowledgeBase\":false,\"retrieval_method\":\"vector\"}\n\n",
    ]);

    const events: string[] = [];
    let metaPayload: unknown;
    let donePayload: unknown;

    await readChatStream(response, {
      onMeta: (payload) => {
        metaPayload = payload;
        events.push("meta");
      },
      onDelta: (chunk) => {
        events.push(chunk);
      },
      onDone: (payload) => {
        donePayload = payload;
        events.push("done");
      },
    });

    expect(metaPayload).toEqual(
      expect.objectContaining({
        grounded: true,
        notInKnowledgeBase: false,
        retrieval_method: "vector",
      }),
    );
    expect(events).toEqual(["meta", "Hello", " world", "done"]);
    expect(donePayload).toEqual(
      expect.objectContaining({
        success: true,
        answer: "Hello world",
      }),
    );
  });

  test("routes error events to the error handler", async () => {
    const response = createStreamResponse([
      "event: error\ndata: {\"error\":\"Generation failed\"}\n\n",
    ]);

    const errors: string[] = [];

    await readChatStream(response, {
      onError: (message) => {
        errors.push(message);
      },
    });

    expect(errors).toEqual(["Generation failed"]);
  });
});