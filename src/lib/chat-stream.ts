type ChatResponse = {
  success?: boolean;
  answer?: string;
  citations?: unknown[];
  grounded?: boolean;
  notInKnowledgeBase?: boolean;
  error?: string;
  retrieval_method?: string;
};

export type ChatStreamHandlers = {
  onMeta?: (payload: Pick<ChatResponse, "citations" | "grounded" | "notInKnowledgeBase" | "retrieval_method">) => void;
  onDelta?: (chunk: string) => void;
  onDone?: (payload: ChatResponse) => void;
  onError?: (message: string) => void;
};

function safeParsePayload(payloadText: string) {
  const compact = payloadText.trim();

  if (!compact) {
    return {} as ChatResponse;
  }

  return JSON.parse(compact) as ChatResponse;
}

export async function readChatStream(response: Response, handlers: ChatStreamHandlers) {
  if (!response.body) {
    throw new Error("Streaming response body is unavailable.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  let dataLines: string[] = [];

  const dispatch = () => {
    if (dataLines.length === 0) {
      eventName = "message";
      return;
    }

    const payloadText = dataLines.join("\n");
    dataLines = [];

    try {
      const parsed = safeParsePayload(payloadText);

      switch (eventName) {
        case "meta":
          handlers.onMeta?.(parsed);
          break;
        case "status":
          break;
        case "delta":
          handlers.onDelta?.(typeof (parsed as { chunk?: unknown }).chunk === "string" ? (parsed as { chunk: string }).chunk : "");
          break;
        case "done":
          handlers.onDone?.(parsed);
          break;
        case "error":
          handlers.onError?.(parsed.error ?? "Failed to answer the question.");
          break;
        default:
          handlers.onDelta?.(typeof (parsed as { chunk?: unknown }).chunk === "string" ? (parsed as { chunk: string }).chunk : payloadText);
          break;
      }
    } catch {
      if (eventName === "error") {
        handlers.onError?.(payloadText || "Failed to answer the question.");
      } else if (eventName === "delta") {
        handlers.onDelta?.(payloadText);
      } else if (eventName === "done") {
        handlers.onDone?.({ answer: payloadText, success: true });
      }
    }

    eventName = "message";
  };

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const newlineIndex = buffer.indexOf("\n");

      if (newlineIndex === -1) {
        break;
      }

      const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
      buffer = buffer.slice(newlineIndex + 1);

      if (!line) {
        dispatch();
        continue;
      }

      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim() || "message";
        continue;
      }

      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).replace(/^\s/, ""));
      }
    }
  }

  if (buffer.trim()) {
    const line = buffer.replace(/\r$/, "");

    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim() || "message";
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^\s/, ""));
    }
  }

  dispatch();
}