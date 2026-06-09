type GenerateResponseOptions = {
  systemPrompt?: string;
  temperature?: number;
  format?: "json" | Record<string, unknown>;
  timeoutMs?: number;
};

type GenerateResponseStreamOptions = GenerateResponseOptions & {
  onToken?: (chunk: string) => void | Promise<void>;
};

type GenerateEmbeddingOptions = {
  model?: string;
  timeoutMs?: number;
};

type OllamaGenerateResult = {
  response?: string;
  model?: string;
  done?: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
};

type OllamaEmbeddingResult = {
  embedding?: number[];
  model?: string;
};

function getOllamaConfig() {
  return {
    baseUrl: (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, ""),
    model: process.env.OLLAMA_MODEL ?? "phi3:mini",
    embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text",
  };
}

function normalizeEmbedding(values: unknown) {
  if (!Array.isArray(values)) {
    throw new Error("Ollama embedding response did not include an embedding array.");
  }

  const embedding = values.map((value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("Ollama embedding response contained invalid values.");
    }

    return value;
  });

  if (embedding.length === 0) {
    throw new Error("Ollama embedding response was empty.");
  }

  return embedding;
}

export async function generateEmbedding(
  input: string,
  options: GenerateEmbeddingOptions = {},
) {
  const { baseUrl, embeddingModel } = getOllamaConfig();
  const model = options.model ?? embeddingModel;
  const requestUrl = new URL("/api/embeddings", baseUrl).toString();
  const controller = new AbortController();
  const timeoutId =
    options.timeoutMs && options.timeoutMs > 0
      ? setTimeout(() => controller.abort(), options.timeoutMs)
      : undefined;

  try {
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: input,
      }),
      signal: controller.signal,
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`Ollama embedding request failed with status ${response.status}: ${responseText}`);
    }

    const payload = JSON.parse(responseText) as OllamaEmbeddingResult;

    return {
      embedding: normalizeEmbedding(payload.embedding),
      raw: payload,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Ollama embedding request timed out.");
    }

    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function generateResponse(
  prompt: string,
  options: GenerateResponseOptions = {},
) {
  const { baseUrl, model } = getOllamaConfig();
  const requestUrl = new URL("/api/generate", baseUrl).toString();
  const controller = new AbortController();
  const timeoutId =
    options.timeoutMs && options.timeoutMs > 0
      ? setTimeout(() => controller.abort(), options.timeoutMs)
      : undefined;

  try {
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        system: options.systemPrompt,
        stream: false,
        format: options.format,
        options:
          options.temperature === undefined
            ? undefined
            : {
                temperature: options.temperature,
              },
      }),
      signal: controller.signal,
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(
        `Ollama request failed with status ${response.status}: ${responseText}`,
      );
    }

    const payload = JSON.parse(responseText) as OllamaGenerateResult;

    return {
      text: payload.response ?? "",
      raw: payload,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Ollama request timed out.");
    }

    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function generateResponseStream(
  prompt: string,
  options: GenerateResponseStreamOptions = {},
) {
  const { baseUrl, model } = getOllamaConfig();
  const requestUrl = new URL("/api/generate", baseUrl).toString();
  const controller = new AbortController();
  const timeoutId =
    options.timeoutMs && options.timeoutMs > 0
      ? setTimeout(() => controller.abort(), options.timeoutMs)
      : undefined;

  try {
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        system: options.systemPrompt,
        stream: true,
        format: options.format,
        options:
          options.temperature === undefined
            ? undefined
            : {
                temperature: options.temperature,
              },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const responseText = await response.text();

      throw new Error(`Ollama request failed with status ${response.status}: ${responseText}`);
    }

    if (!response.body) {
      throw new Error("Ollama streaming response did not include a body.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let lastPayload: OllamaGenerateResult | null = null;

    const handleLine = async (line: string) => {
      const compact = line.trim();

      if (!compact) {
        return;
      }

      const payload = JSON.parse(compact) as OllamaGenerateResult;

      if (typeof payload.response === "string" && payload.response) {
        text += payload.response;

        if (options.onToken) {
          await options.onToken(payload.response);
        }
      }

      if (payload.done) {
        lastPayload = payload;
      }
    };

    try {
      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          await handleLine(line);
        }
      }

      const trailing = buffer.trim();

      if (trailing) {
        await handleLine(trailing);
      }
    } finally {
      reader.releaseLock();
    }

    return {
      text,
      raw: lastPayload,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Ollama request timed out.");
    }

    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}