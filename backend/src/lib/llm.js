import LlmCall from "../models/LlmCall.js";

// Single choke point for every chat-completion call in the app. Going through
// completeJSON gives each feature observability (LlmCall), prompt versioning,
// and schema validation for free — and gives tests one seam to mock.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// USD per million tokens. Static estimates for the dashboard — update when
// models change. Unknown models cost 0 rather than failing the request.
const PRICES_PER_MTOK = {
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
  "google/gemini-2.5-flash": { input: 0.3, output: 2.5 },
};

export function estimateCostUsd(model, promptTokens, completionTokens) {
  const price = PRICES_PER_MTOK[model];
  if (!price) return 0;
  return (promptTokens * price.input + completionTokens * price.output) / 1e6;
}

// Fire-and-forget: observability must never block or break a user response.
// LLM_LOG_DISABLED=1 turns logging off entirely — used by the eval runners,
// which run without a DB connection and shouldn't pollute dashboard stats.
export function logLlmCall(fields) {
  if (process.env.LLM_LOG_DISABLED) return;
  LlmCall.create(fields).catch((error) =>
    console.error("[LLM] Failed to log call:", error.message)
  );
}

// Calls OpenRouter, expects a JSON response body, optionally validates it
// against a zod schema, and records the call. Throws on any failure so the
// caller's primary→fallback chain can retry with another model.
export async function completeJSON({
  feature,
  model,
  prompt,
  schema = null,
  promptVersion = "",
  userId = null,
  fallbackUsed = false,
  meta = null,
  // Hard output cap. Our JSON responses are well under 2k tokens; without an
  // explicit cap OpenRouter pre-authorizes the model's MAX output (e.g. 65k
  // tokens) and 402s low-balance accounts. Bounding it is also basic cost
  // hygiene: no response can ever cost more than the cap.
  maxTokens = 2048,
}) {
  const started = Date.now();
  const log = (fields) =>
    logLlmCall({
      feature,
      userId,
      model,
      promptVersion,
      fallbackUsed,
      latencyMs: Date.now() - started,
      ...(meta ? { meta } : {}),
      ...fields,
    });

  let response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        plugins: [{ id: "response-healing" }],
      }),
    });
  } catch (error) {
    log({ success: false, errorType: "network_error" });
    throw new Error(`Network error calling ${model}: ${error.message}`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    log({ success: false, errorType: `http_${response.status}` });
    throw new Error(`OpenRouter error from ${model}: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    log({ success: false, errorType: "empty_response" });
    throw new Error(`Empty response body from ${model}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    log({ success: false, errorType: "invalid_json" });
    throw new Error(`Model ${model} returned unparseable JSON`);
  }

  if (schema) {
    const validation = schema.safeParse(parsed);
    if (!validation.success) {
      const firstIssue = validation.error.issues[0];
      log({ success: false, errorType: "schema_invalid" });
      throw new Error(
        `Model ${model} returned schema-invalid output: ${firstIssue?.path?.join(".")} ${firstIssue?.message}`
      );
    }
    parsed = validation.data;
  }

  const usage = data.usage || {};
  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;
  log({
    success: true,
    promptTokens,
    completionTokens,
    costUsd: estimateCostUsd(model, promptTokens, completionTokens),
  });

  return parsed;
}
