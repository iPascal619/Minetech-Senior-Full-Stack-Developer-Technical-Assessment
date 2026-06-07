type GenerateResponseOptions = {
  systemPrompt?: string;
  temperature?: number;
  format?: "json" | Record<string, unknown>;
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

function getOllamaConfig() {
  return {
    baseUrl: (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, ""),
    model: process.env.OLLAMA_MODEL ?? "phi3:mini",
  };
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