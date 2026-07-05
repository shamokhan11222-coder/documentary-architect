import { createFileRoute } from "@tanstack/react-router";

// Silent, internal image generation. Images are routed only through the user's
// selected external image provider (Recraft is primary). The built-in AI is
// never used for images.
// Gemini API version is NOT hardcoded at every call site — it is resolved from
// this single constant and we probe alternate versions when a model 404s.
const GEMINI_HOST = "https://generativelanguage.googleapis.com";
// Ordered by preference. When a model is missing on one version we try the next.
const GEMINI_API_VERSIONS = ["v1beta", "v1"] as const;
const geminiModelsUrl = (version: string) => `${GEMINI_HOST}/${version}/models`;
// Gemini (Google AI Studio) auth. Google AI Studio issues TWO credential
// formats and they authenticate differently against generativelanguage:
//   • Legacy API keys (start with "AIza…") → API-key auth via x-goog-api-key.
//   • Newer AI Studio tokens (start with "AQ…") → OAuth-style bearer tokens;
//     Google routes them through OAuth validation and REJECTS them on the
//     ?key= / x-goog-api-key path with 401 UNAUTHENTICATED. They must be sent
//     as `Authorization: Bearer <token>`.
// We never use an OpenAI-compatible endpoint for Gemini image generation.
function isGeminiApiKey(key: string): boolean {
  return key.trim().startsWith("AIza");
}
const geminiAuthHeaders = (apiKey: string, extra?: Record<string, string>) => {
  const key = (apiKey ?? "").trim();
  const auth: Record<string, string> = isGeminiApiKey(key)
    ? { "x-goog-api-key": key }
    : { Authorization: `Bearer ${key}` };
  return { ...auth, ...(extra ?? {}) };
};
/** Mask an API key, keeping only the first 6 and last 4 characters. */
const maskKey = (k?: string) =>
  !k ? "(none)" : k.length <= 10 ? "****" : `${k.slice(0, 6)}…${k.slice(-4)}`;
// Legacy alias kept for the non-Gemini helpers below.
const GOOGLE = geminiModelsUrl(GEMINI_API_VERSIONS[0]);
// Current, existing Gemini image model. NOT the old preview id that 404s.
// Only used as a starting point — the real model is resolved dynamically and
// validated against the live models list before generating.
const GEMINI_IMAGE_MODEL_DEFAULT = "gemini-2.5-flash-image";
const OPENAI = "https://api.openai.com/v1/images/generations";
const FAL = "https://fal.run";
const REPLICATE = "https://api.replicate.com/v1/models";
const RECRAFT = "https://external.api.recraft.ai/v1/images/generations";
const PROVIDER_REQUIRED =
  "Recraft is not connected. Add your Recraft API key in API Settings and test the connection.";

type Provider = {
  name?: "gemini" | "openai" | "fal" | "replicate" | "recraft" | "builtin";
  apiKey?: string;
  imageModel?: string;
  fallback?: boolean;
};
type Body = { prompt?: string; references?: string[]; provider?: Provider; test?: boolean };
type ListBody = {
  action?: "listGeminiModels" | "geminiDiagnostics" | "geminiImageDiagnostics";
  apiKey?: string;
  imageModel?: string;
};

export type ImageDiagCheck = {
  id: number;
  label: string;
  status: "PASS" | "FAIL" | "UNKNOWN";
  detail: string;
};

/** Comprehensive Gemini IMAGE diagnostics. Runs a series of PASS/FAIL checks
 *  WITHOUT generating any image, and returns the exact raw Google response
 *  bodies, request URL, headers (key redacted), request body and status codes.
 *  Nothing is summarised — the real provider error is surfaced verbatim. */
async function geminiImageDiagnostics(apiKeyRaw?: string, imageModelRaw?: string): Promise<Response> {
  const apiKey = (apiKeyRaw ?? "").trim();
  const model = (imageModelRaw ?? "").trim() || GEMINI_IMAGE_MODEL_DEFAULT;
  const checks: ImageDiagCheck[] = [];
  const push = (label: string, status: ImageDiagCheck["status"], detail: string) =>
    checks.push({ id: checks.length + 1, label, status, detail });

  const version = GEMINI_API_VERSIONS[0];
  const listUrl = `${geminiModelsUrl(version)}?pageSize=200`;
  const listUrlRedacted = listUrl;
  const modelUrl = `${geminiModelsUrl(version)}/${model}`;
  const modelUrlRedacted = modelUrl;

  const authLabel = isGeminiApiKey(apiKey)
    ? { "x-goog-api-key": maskKey(apiKey) }
    : { Authorization: `Bearer ${maskKey(apiKey)}` };
  const requestHeaders = { "Content-Type": "application/json", ...authLabel };

  // 1. API key is present / well-formed.
  if (!apiKey) {
    push("API key is valid (format)", "FAIL", "No API key provided.");
  } else if (!/^[0-9A-Za-z_-]{20,}$/.test(apiKey)) {
    // Format is informational only — Google decides validity. Both AI Studio
    // formats (legacy AIza… and newer AQ…) are accepted; only reject strings
    // that clearly cannot be a key (too short / illegal chars).
    push("API key is valid (format)", "UNKNOWN", `Key present (${apiKey.length} chars, prefix ${apiKey.slice(0, 4)}…) but is unusually short or has unexpected characters. Google will make the final decision.`);
  } else {
    push("API key is valid (format)", "PASS", `Key present (${apiKey.length} chars, prefix ${apiKey.slice(0, 4)}…). Accepts both AIza… and newer AQ… Google AI Studio formats.`);
  }

  // Live models-list request (auth + connectivity + endpoint reachability).
  let listStatus = 0;
  let listBody = "";
  let listHeaders: Record<string, string> = {};
  let networkOk = false;
  let listStarted = Date.now();
  try {
    listStarted = Date.now();
    const r = await fetch(listUrl, { headers: geminiAuthHeaders(apiKey) });
    networkOk = true;
    listStatus = r.status;
    r.headers.forEach((v, k) => (listHeaders[k] = v));
    listBody = await r.text();
  } catch (e) {
    listBody = `Fetch failed: ${String(e).slice(0, 400)}`;
  }
  const listMs = Date.now() - listStarted;

  // 3. Internet connection succeeded.
  checks.push({
    id: 3,
    label: "Internet connection succeeded",
    status: networkOk ? "PASS" : "FAIL",
    detail: networkOk ? `Reached Google in ${listMs}ms.` : listBody,
  });
  // 4. Gemini endpoint reachable.
  checks.push({
    id: 4,
    label: "Gemini endpoint reachable",
    status: networkOk && listStatus > 0 ? "PASS" : "FAIL",
    detail: networkOk ? `HTTP ${listStatus} from ${geminiModelsUrl(version)}.` : "No HTTP response received.",
  });
  // 2. API key authentication succeeded.
  const authOk = listStatus === 200;
  checks.push({
    id: 2,
    label: "API key authentication succeeded",
    status: networkOk ? (authOk ? "PASS" : "FAIL") : "UNKNOWN",
    detail: !networkOk
      ? "No response — could not verify authentication."
      : authOk
        ? "Google accepted the API key (HTTP 200)."
        : `Google rejected the request (HTTP ${listStatus}).`,
  });

  // Parse the available models from the list response.
  let listModels: GeminiModel[] = [];
  try {
    listModels = (JSON.parse(listBody) as { models?: GeminiModel[] }).models ?? [];
  } catch {
    /* body was an error, not a model list */
  }

  // Live GET on the specific model (exists + capability).
  let modelStatus = 0;
  let modelBody = "";
  let modelHeaders: Record<string, string> = {};
  let modelJson: GeminiModel | null = null;
  if (apiKey) {
    try {
      const r = await fetch(modelUrl, { headers: geminiAuthHeaders(apiKey) });
      modelStatus = r.status;
      r.headers.forEach((v, k) => (modelHeaders[k] = v));
      modelBody = await r.text();
      try {
        modelJson = JSON.parse(modelBody) as GeminiModel;
      } catch {
        /* error body */
      }
    } catch (e) {
      modelBody = `Fetch failed: ${String(e).slice(0, 400)}`;
    }
  }

  // 5. Selected model exists.
  const modelExists = modelStatus === 200 && !!modelJson?.name;
  checks.push({
    id: 5,
    label: `Selected model exists ("${model}")`,
    status: modelExists ? "PASS" : "FAIL",
    detail: modelExists
      ? `Found ${bareModelId(modelJson!.name)} on ${version}.`
      : `Model lookup returned HTTP ${modelStatus}. It may not exist on ${version}.`,
  });

  // 6. Selected model supports image generation.
  const capable = modelJson ? isImageCapable(modelJson) : false;
  const methods = modelJson
    ? [...(modelJson.supportedGenerationMethods ?? []), ...(modelJson.supportedActions ?? [])].join(", ")
    : "";
  checks.push({
    id: 6,
    label: "Selected model supports image generation",
    status: modelExists ? (capable ? "PASS" : "FAIL") : "UNKNOWN",
    detail: !modelExists
      ? "Model not found — cannot check capabilities."
      : capable
        ? `Image-capable. Supported methods: ${methods || "(name/displayName indicates image)"}.`
        : `Model exists but is not image-capable. Supported methods: ${methods || "none reported"}.`,
  });

  // Quota / rate-limit signals. Google's generativelanguage API does not expose
  // a numeric quota endpoint; the truthful signal is a 429 RESOURCE_EXHAUSTED
  // and any x-ratelimit / retry headers it returns.
  const rateHeaderKeys = Object.keys({ ...listHeaders, ...modelHeaders }).filter((k) =>
    /ratelimit|quota|retry-after/i.test(k),
  );
  const rateHeaders = rateHeaderKeys.length
    ? rateHeaderKeys.map((k) => `${k}: ${listHeaders[k] ?? modelHeaders[k]}`).join("\n")
    : "";
  const quotaExhausted = listStatus === 429 || modelStatus === 429;
  // 7. Current quota available.
  checks.push({
    id: 7,
    label: "Current quota available",
    status: !networkOk ? "UNKNOWN" : quotaExhausted ? "FAIL" : authOk ? "PASS" : "UNKNOWN",
    detail: quotaExhausted
      ? "Quota exhausted — Google returned HTTP 429 (RESOURCE_EXHAUSTED)."
      : authOk
        ? "No quota-exhaustion (429) reported on these read requests."
        : "Could not confirm — request was not authorised.",
  });
  // 8. Remaining quota (if available).
  checks.push({
    id: 8,
    label: "Remaining quota (if reported)",
    status: rateHeaders ? "PASS" : "UNKNOWN",
    detail: rateHeaders
      ? rateHeaders
      : "Google's generativelanguage API does not report remaining quota on these endpoints. Check Google AI Studio / Cloud Console for exact numbers.",
  });
  // 9. Current rate limit.
  checks.push({
    id: 9,
    label: "Current rate limit",
    status: rateHeaders ? "PASS" : "UNKNOWN",
    detail: rateHeaders
      ? rateHeaders
      : "No rate-limit headers returned by Google on these endpoints.",
  });
  // 10. Exact Google response body (surfaced verbatim below in rawModel/rawList).
  checks.push({
    id: 10,
    label: "Exact Google response body captured",
    status: modelBody || listBody ? "PASS" : "FAIL",
    detail: "Raw request/response details are shown below, exactly as received.",
  });

  return Response.json({
    model,
    checks,
    // Raw, verbatim request/response details — nothing summarised.
    modelsList: {
      requestUrl: listUrlRedacted,
      requestHeaders,
      requestBody: "(none — GET request)",
      responseCode: listStatus,
      responseHeaders: listHeaders,
      responseBody: listBody.slice(0, 40000),
    },
    modelLookup: {
      requestUrl: modelUrlRedacted,
      requestHeaders,
      requestBody: "(none — GET request)",
      responseCode: modelStatus,
      responseHeaders: modelHeaders,
      responseBody: modelBody.slice(0, 40000),
    },
  });
}

function jsonError(error: string, status = 400, code?: string) {
  console.error("[image] error", { status, code: code ?? null, error });
  return new Response(JSON.stringify({ error, code: code ?? null, status }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Pull the exact provider error message out of a raw JSON error body. */
function extractProviderMessage(text: string): string {
  try {
    const j = JSON.parse(text);
    return (
      j?.error?.message ||
      j?.message ||
      j?.error?.status ||
      (typeof j?.error === "string" ? j.error : "") ||
      ""
    );
  } catch {
    return "";
  }
}

export interface ImageErrorDebug {
  provider: string;
  model: string;
  endpoint: string;
  httpMethod: string;
  httpStatus: number | null;
  requestId: string | null;
  retryAfter: string | null;
  code: string | null;
  errorType: string | null;
  providerMessage: string;
  responseHeaders: Record<string, string>;
  rawJson: unknown;
  rawBody: string;
}

/** Emergency Debug failure. Returns the EXACT provider response — provider,
 *  model, endpoint, HTTP status, raw body, request id, retry-after, error code
 *  and the verbatim provider error message. Never a generic UI message. */
function providerFail(args: {
  provider: string;
  model: string;
  endpoint: string;
  status: number;
  rawBody: string;
  headers?: Headers;
  code?: string;
  httpMethod?: string;
}): Response {
  const { provider, model, endpoint, status, rawBody, headers } = args;
  const requestId =
    headers?.get("x-request-id") ??
    headers?.get("x-goog-request-id") ??
    headers?.get("x-goog-request-log-id") ??
    null;
  const retryAfter = headers?.get("retry-after") ?? null;
  const providerMessage = extractProviderMessage(rawBody) || rawBody.slice(0, 800) || `HTTP ${status}`;
  const code = args.code ?? codeForProviderResponse(status, rawBody);
  // Capture ALL response headers verbatim (they are provider diagnostics, no secrets).
  const responseHeaders: Record<string, string> = {};
  headers?.forEach((v, k) => (responseHeaders[k] = v));
  // Parse the raw provider body as JSON when possible so the UI can show it exactly.
  let rawJson: unknown = null;
  let errorType: string | null = null;
  try {
    rawJson = JSON.parse(rawBody);
    const e = (rawJson as { error?: { status?: string; type?: string; code?: string } })?.error;
    errorType = e?.status ?? e?.type ?? e?.code ?? null;
  } catch {
    /* not JSON */
  }
  const debug: ImageErrorDebug = {
    provider,
    model,
    endpoint,
    httpMethod: args.httpMethod ?? "POST",
    httpStatus: status,
    requestId,
    retryAfter,
    code,
    errorType,
    providerMessage,
    responseHeaders,
    rawJson,
    rawBody: rawBody.slice(0, 20000),
  };
  const error = `${provider} ${status}: ${providerMessage}`;
  console.error("[image][DEBUG] provider error", debug);
  return new Response(JSON.stringify({ error, code, status, debug }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Classify an upstream HTTP status into a stable machine code the frontend
 *  maps to a specific, human-readable message. */
function codeForStatus(status: number): string {
  if (status === 401 || status === 403) return "AUTH_ERROR";
  if (status === 429) return "RATE_LIMIT";
  if (status === 402) return "CREDITS_EXHAUSTED";
  if (status >= 500) return "PROVIDER_ERROR";
  return "PROVIDER_ERROR";
}

function isProviderLimit(status: number, text: string): boolean {
  return status === 429 || /tier limit exceeded|rate.?limit|too many requests|resource_exhausted/i.test(text);
}

function codeForProviderResponse(status: number, text: string): string {
  if (isProviderLimit(status, text)) return "RATE_LIMIT";
  return codeForStatus(status);
}

/** Turn a lightweight validation response into a normalized result. */
function validationResult(r: Response, label: string): Response {
  if (r.ok) return Response.json({ ok: true });
  const msg =
    r.status === 400 || r.status === 401 || r.status === 403
      ? "Invalid API key."
      : r.status === 429
        ? `Rate limit exceeded (${label}).`
        : `${label} validation failed (${r.status}).`;
  return jsonError(msg, r.status, r.status === 400 ? "AUTH_ERROR" : codeForStatus(r.status));
}

/** Gemini-specific validation. Surfaces the EXACT raw Google response body
 *  instead of a generic "Invalid API key." — only reports an invalid key when
 *  Google actually returns API_KEY_INVALID. */
async function geminiValidationResult(r: Response, label: string): Promise<Response> {
  if (r.ok) return Response.json({ ok: true });
  const text = (await r.text().catch(() => "")) || `HTTP ${r.status}`;
  const providerMessage = extractProviderMessage(text) || text.slice(0, 800) || `HTTP ${r.status}`;
  const keyInvalid = /API_KEY_INVALID|API key not valid/i.test(text);
  const code = keyInvalid ? "AUTH_ERROR" : codeForProviderResponse(r.status, text);
  return providerFail({
    provider: "gemini",
    model: label,
    endpoint: r.url || GEMINI_HOST,
    status: r.status,
    rawBody: `${providerMessage}\n\n${text}`,
    headers: r.headers,
    code,
    httpMethod: "GET",
  });
}

/** Validate a provider with the smallest possible request — never generates a
 *  full image. Uses each provider's lightweight auth/list endpoint. */
async function validateProvider(provider: Provider): Promise<Response> {
  const name = provider.name;
  if (!provider.apiKey) return jsonError(PROVIDER_REQUIRED, 400, "NO_PROVIDER");
  try {
    if (name === "recraft") {
      const r = await fetch("https://external.api.recraft.ai/v1/users/me", {
        headers: { Authorization: `Bearer ${provider.apiKey}` },
      });
      return validationResult(r, "Recraft");
    }
    if (name === "gemini") {
      // Image/thumbnail providers must be validated against the actual Gemini
      // IMAGE model — never the text/models-list activation path. We resolve the
      // API version that serves the model instead of hardcoding v1beta.
      const imageModel = provider.imageModel?.trim();
      if (imageModel && imageModel.toLowerCase().includes("image")) {
        const version = await resolveGeminiModelVersion(provider.apiKey, imageModel);
        if (!version) {
          const listed = await fetchGeminiModels(provider.apiKey);
          const available =
            "models" in listed
              ? listed.models.filter(isImageCapable).map((m) => bareModelId(m.name))
              : [];
          const hint = available.length ? ` Available image models: ${available.join(", ")}.` : "";
          return jsonError(
            `Gemini image model "${imageModel}" does not exist on any supported API version.${hint}`,
            404,
            "MODEL_NOT_FOUND",
          );
        }
        const r = await fetch(`${geminiModelsUrl(version)}/${imageModel}`, {
          headers: geminiAuthHeaders(provider.apiKey!),
        });
        return geminiValidationResult(r, "Gemini Image");
      }
      // Text-only validation: lightweight models-list check.
      const r = await fetch(`${GOOGLE}?pageSize=1`, {
        headers: geminiAuthHeaders(provider.apiKey!),
      });
      return geminiValidationResult(r, "Gemini");
    }
    if (name === "openai") {
      const r = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${provider.apiKey}` },
      });
      return validationResult(r, "OpenAI");
    }
    if (name === "replicate") {
      const r = await fetch("https://api.replicate.com/v1/account", {
        headers: { Authorization: `Bearer ${provider.apiKey}` },
      });
      return validationResult(r, "Replicate");
    }
    if (name === "fal") {
      // Fal.ai has no lightweight auth-check endpoint; accept a present key.
      return Response.json({ ok: true });
    }
  } catch (e) {
    return jsonError(`Provider validation failed: ${String(e).slice(0, 200)}`, 502, "PROVIDER_ERROR");
  }
  return jsonError(PROVIDER_REQUIRED, 400, "NO_PROVIDER");
}

/** Log the outcome of an upstream provider call in a redaction-safe way
 *  (never logs the API key itself, only its length/prefix). */
function logProviderCall(
  providerName: string,
  model: string,
  apiKey: string | undefined,
  status: number,
  ok: boolean,
  payloadPreview: string,
) {
  console.log("[image] provider call", {
    provider: providerName,
    model,
    apiKey: apiKey ? maskKey(apiKey) : "none (built-in)",
    httpStatus: status,
    ok,
    payload: payloadPreview.slice(0, 300),
  });
}

function firstUrl(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = firstUrl(item);
      if (hit) return hit;
    }
    return null;
  }
  const obj = value as Record<string, unknown>;
  return firstUrl(obj.url) ?? firstUrl(obj.image) ?? firstUrl(obj.images) ?? firstUrl(obj.output) ?? firstUrl(obj.data);
}

function toInlineData(ref: string) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(ref);
  if (!m) return null;
  return { inlineData: { mimeType: m[1], data: m[2] } };
}

type GeminiModel = {
  name: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
  supportedActions?: string[];
};

/** Bare model id (strip the "models/" prefix Google returns). */
function bareModelId(name: string): string {
  return name.replace(/^models\//, "");
}

/** A model is image-capable if its id/displayName mentions "image" or it lists
 *  image generation among its supported methods/actions. */
function isImageCapable(m: GeminiModel): boolean {
  const hay = `${m.name} ${m.displayName ?? ""}`.toLowerCase();
  if (hay.includes("image")) return true;
  const methods = [...(m.supportedGenerationMethods ?? []), ...(m.supportedActions ?? [])]
    .join(" ")
    .toLowerCase();
  return methods.includes("image") || methods.includes("predict");
}

/** List all Gemini models the key can see, across API versions. Returns the
 *  raw list plus the endpoint used so callers can surface it for debugging. */
async function fetchGeminiModels(
  apiKey: string,
): Promise<{ models: GeminiModel[]; endpoint: string; version: string } | { error: string; status: number }> {
  let lastErr = "Unknown error";
  let lastStatus = 502;
  for (const version of GEMINI_API_VERSIONS) {
    const endpoint = `${geminiModelsUrl(version)}?pageSize=200`;
    try {
      const r = await fetch(endpoint, { headers: geminiAuthHeaders(apiKey) });
      if (r.ok) {
        const data = (await r.json()) as { models?: GeminiModel[] };
        return { models: data.models ?? [], endpoint: geminiModelsUrl(version), version };
      }
      lastStatus = r.status;
      lastErr = (await r.text().catch(() => "")).slice(0, 200) || `HTTP ${r.status}`;
      // Auth errors won't be fixed by trying another version.
      if (r.status === 400 || r.status === 401 || r.status === 403) break;
    } catch (e) {
      lastErr = String(e).slice(0, 200);
    }
  }
  return { error: lastErr, status: lastStatus };
}

/** Resolve which API version actually serves a given model id. Returns null if
 *  no version has it (i.e. the configured model does not exist). */
async function resolveGeminiModelVersion(
  apiKey: string,
  model: string,
): Promise<string | null> {
  for (const version of GEMINI_API_VERSIONS) {
    const endpoint = `${geminiModelsUrl(version)}/${model}`;
    try {
      const r = await fetch(endpoint, { headers: geminiAuthHeaders(apiKey) });
      if (r.ok) return version;
    } catch {
      /* try next version */
    }
  }
  return null;
}

/** Diagnostic endpoint — return the image-capable Gemini models for a key so
 *  the UI can let the user pick a real, existing model. */
async function listGeminiModels(apiKey: string): Promise<Response> {
  if (!apiKey?.trim()) return jsonError("Add a Google Gemini API key first.", 400, "NO_PROVIDER");
  const res = await fetchGeminiModels(apiKey.trim());
  if ("error" in res) {
    // Surface the EXACT Google response — no generic "Invalid API key" wrapper
    // unless Google itself returned API_KEY_INVALID.
    const keyInvalid = /API_KEY_INVALID|API key not valid/i.test(res.error);
    const msg = `Gemini could not list models (HTTP ${res.status}): ${res.error}`;
    return jsonError(msg, res.status, keyInvalid ? "AUTH_ERROR" : codeForStatus(res.status));
  }
  const imageModels = res.models.filter(isImageCapable).map((m) => ({
    id: bareModelId(m.name),
    displayName: m.displayName ?? bareModelId(m.name),
  }));
  const allModels = res.models.map((m) => bareModelId(m.name));
  return Response.json({
    endpoint: res.endpoint,
    apiVersion: res.version,
    imageModels,
    allModels,
  });
}

/** Full raw diagnostics for a Gemini key. Performs exactly ONE live models-list
 *  request and returns the full request URL (key redacted), API version,
 *  HTTP status code, and the complete raw response body — no content is
 *  generated. Used by the Gemini Diagnostics page. */
async function geminiDiagnostics(apiKey: string, imageModel?: string): Promise<Response> {
  const key = apiKey?.trim();
  if (!key) {
    return Response.json({
      ok: false,
      error: "No Gemini API key detected. Add one in API Settings.",
      host: GEMINI_HOST,
      apiVersions: GEMINI_API_VERSIONS,
      authMethod: "API key via ?key= query parameter",
    });
  }
  const version = GEMINI_API_VERSIONS[0];
  const requestUrl = `${geminiModelsUrl(version)}?pageSize=200`;
  const redactedUrl = requestUrl;
  let httpStatus = 0;
  let statusText = "";
  let responseBody = "";
  let ok = false;
  const model = imageModel?.trim() || null;
  const requestMethod = "GET";
  const requestHeaders: Record<string, string> = {
    "x-goog-api-key": maskKey(key),
    accept: "application/json",
  };
  const responseHeaders: Record<string, string> = {};
  const fullRequest =
    `${requestMethod} ${redactedUrl}\n` +
    Object.entries(requestHeaders)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n") +
    `\n\n(no request body)`;
  const started = Date.now();
  try {
    const r = await fetch(requestUrl, { headers: geminiAuthHeaders(key, { accept: "application/json" }) });
    httpStatus = r.status;
    statusText = r.statusText;
    ok = r.ok;
    r.headers.forEach((v, k) => {
      responseHeaders[k] = v;
    });
    responseBody = await r.text();
  } catch (e) {
    responseBody = `Fetch failed: ${String(e).slice(0, 300)}`;
  }
  const fullResponse =
    `HTTP ${httpStatus} ${statusText}\n` +
    Object.entries(responseHeaders)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n") +
    `\n\n${responseBody.slice(0, 20000)}`;
  return Response.json({
    ok,
    host: GEMINI_HOST,
    endpoint: geminiModelsUrl(version),
    apiVersion: version,
    apiVersions: GEMINI_API_VERSIONS,
    authMethod: "API key via ?key= query parameter",
    requestUrl: redactedUrl,
    requestMethod,
    requestHeaders,
    fullRequest,
    httpStatus,
    statusText,
    responseHeaders,
    fullResponse,
    ms: Date.now() - started,
    imageModel: model,
    model,
    responseBody: responseBody.slice(0, 20000),
  });
}

// Generate through the user's own Google Gemini key (no Lovable AI involved).
async function generateWithGemini(body: Body, provider: Provider): Promise<Response> {
  const apiKey = provider.apiKey ?? "";
  // Force an image-capable model. Never use a text model (e.g. gemini-2.5-flash).
  let model = (provider.imageModel || "").trim();
  if (!model.toLowerCase().includes("image")) {
    model = GEMINI_IMAGE_MODEL_DEFAULT;
  }
  const parts: unknown[] = [{ text: body.prompt }];
  for (const ref of (body.references ?? []).slice(0, 6)) {
    const inline = typeof ref === "string" && ref.startsWith("data:") ? toInlineData(ref) : null;
    if (inline) parts.push(inline);
  }
  const reqBody = JSON.stringify({
    contents: [{ role: "user", parts }],
    generationConfig: { responseModalities: ["IMAGE"] },
  });
  // AUDIT: exactly ONE outbound generateContent request per call in the normal
  // case. The API version is NOT hardcoded — we try the preferred version and
  // only fall through to the next version if the model returns 404 there (i.e.
  // that version doesn't serve this model). No preview/verification requests.
  let upstream: Response | null = null;
  let usedVersion: string = GEMINI_API_VERSIONS[0];
  let notFoundText = "";
  for (const version of GEMINI_API_VERSIONS) {
    const endpoint = `${geminiModelsUrl(version)}/${model}:generateContent`;
    const auditStart = Date.now();
    console.log("[AUDIT][gemini] outbound request", {
      endpoint,
      model,
      apiVersion: version,
      auth: "x-goog-api-key header",
      apiKey: maskKey(apiKey),
      time: new Date(auditStart).toISOString(),
      references: parts.length - 1,
    });
    const r = await fetch(endpoint, {
      method: "POST",
      headers: geminiAuthHeaders(apiKey, { "Content-Type": "application/json" }),
      body: reqBody,
    });
    console.log("[AUDIT][gemini] outbound response", {
      endpoint,
      model,
      apiVersion: version,
      responseCode: r.status,
      ms: Date.now() - auditStart,
    });
    // Only a 404 means "wrong API version for this model" — try the next one.
    if (r.status === 404) {
      notFoundText = (await r.text().catch(() => "")).slice(0, 200);
      continue;
    }
    upstream = r;
    usedVersion = version;
    break;
  }
  // Model genuinely not found on any version — surface the real available models.
  if (!upstream) {
    return providerFail({
      provider: "gemini",
      model,
      endpoint: `${geminiModelsUrl(GEMINI_API_VERSIONS[0])}/${model}:generateContent`,
      status: 404,
      rawBody: notFoundText || `Model "${model}" not found on any supported API version (${GEMINI_API_VERSIONS.join(", ")}).`,
      code: "MODEL_NOT_FOUND",
    });
  }
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    const status = upstream.status;
    logProviderCall("gemini", model, provider.apiKey, status, false, text);
    return providerFail({
      provider: "gemini",
      model,
      endpoint: `${geminiModelsUrl(usedVersion)}/${model}:generateContent`,
      status,
      rawBody: text,
      headers: upstream.headers,
    });
  }
  const data = await upstream.json();
  const partsOut = data?.candidates?.[0]?.content?.parts ?? [];
  const inline = partsOut.find((p: { inlineData?: { data?: string } }) => p?.inlineData?.data);
  const b64 = inline?.inlineData?.data;
  logProviderCall("gemini", model, provider.apiKey, upstream.status, true, b64 ? "b64 image" : "no image");
  if (!b64)
    return providerFail({
      provider: "gemini",
      model,
      endpoint: `${geminiModelsUrl(usedVersion)}/${model}:generateContent`,
      status: 502,
      rawBody: JSON.stringify(data).slice(0, 20000),
      headers: upstream.headers,
      code: "PROVIDER_ERROR",
    });
  const mime = inline.inlineData.mimeType || "image/png";
  return Response.json({ image: `data:${mime};base64,${b64}` });
}

async function generateWithOpenAI(body: Body, provider: Provider): Promise<Response> {
  // Force an image-capable model — a text model (e.g. gpt-4o-mini) is never
  // valid on the Images endpoint.
  let model = provider.imageModel || "gpt-image-1";
  if (!model.toLowerCase().includes("image")) model = "gpt-image-1";

  // Dedicated OpenAI Images API — NOT chat completions.
  const reqBody = { model, prompt: body.prompt, size: "1024x1024", n: 1 };
  console.log("[image] OpenAI request", {
    endpoint: OPENAI,
    model,
    headers: { Authorization: "Bearer ****", "Content-Type": "application/json" },
    body: { ...reqBody, prompt: (body.prompt ?? "").slice(0, 200) },
  });

  const upstream = await fetch(OPENAI, {
    method: "POST",
    headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(reqBody),
  });

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    const status = upstream.status;
    logProviderCall("openai", model, provider.apiKey, status, false, text);
    console.error("[image] OpenAI full error response", { httpStatus: status, body: text });
    // Emergency Debug: surface the EXACT OpenAI response — no custom UI text.
    let oaCode = "";
    try {
      oaCode = JSON.parse(text)?.error?.code || "";
    } catch {
      /* raw body used as-is */
    }
    const code =
      status === 401 || oaCode === "invalid_api_key"
        ? "AUTH_ERROR"
        : oaCode === "insufficient_quota" || status === 402
          ? "CREDITS_EXHAUSTED"
          : codeForProviderResponse(status, text);
    return providerFail({
      provider: "openai",
      model,
      endpoint: OPENAI,
      status,
      rawBody: text,
      headers: upstream.headers,
      code,
    });
  }

  const data = await upstream.json();
  console.log("[image] OpenAI success", {
    httpStatus: upstream.status,
    model,
    hasB64: !!data?.data?.[0]?.b64_json,
    hasUrl: !!data?.data?.[0]?.url,
  });
  const b64 = data?.data?.[0]?.b64_json;
  const url = data?.data?.[0]?.url;
  if (b64) return Response.json({ image: `data:image/png;base64,${b64}` });
  if (typeof url === "string" && url.trim()) return Response.json({ image: url });
  return providerFail({
    provider: "openai",
    model,
    endpoint: OPENAI,
    status: 502,
    rawBody: JSON.stringify(data).slice(0, 20000),
    headers: upstream.headers,
    code: "PROVIDER_ERROR",
  });
}

async function generateWithFal(body: Body, provider: Provider): Promise<Response> {
  const model = provider.imageModel || "fal-ai/flux/schnell";
  const upstream = await fetch(`${FAL}/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${provider.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: body.prompt, image_size: "landscape_16_9", num_images: 1 }),
  });
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    const status = upstream.status;
    logProviderCall("fal", model, provider.apiKey, status, false, text);
    return providerFail({ provider: "fal", model, endpoint: `${FAL}/${model}`, status, rawBody: text, headers: upstream.headers });
  }
  const data = await upstream.json();
  const url = firstUrl(data);
  if (url) return Response.json({ image: url });
  return providerFail({ provider: "fal", model, endpoint: `${FAL}/${model}`, status: 502, rawBody: JSON.stringify(data).slice(0, 20000), code: "PROVIDER_ERROR" });
}

async function generateWithReplicate(body: Body, provider: Provider): Promise<Response> {
  const model = provider.imageModel || "black-forest-labs/flux-schnell";
  const create = await fetch(`${REPLICATE}/${model}/predictions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json", Prefer: "wait" },
    body: JSON.stringify({ input: { prompt: body.prompt, aspect_ratio: "16:9", output_format: "png" } }),
  });
  if (!create.ok) {
    const text = await create.text().catch(() => "");
    const status = create.status;
    logProviderCall("replicate", model, provider.apiKey, status, false, text);
    return providerFail({ provider: "replicate", model, endpoint: `${REPLICATE}/${model}/predictions`, status, rawBody: text, headers: create.headers });
  }
  let data = await create.json();
  for (let i = 0; i < 20 && data?.status !== "succeeded" && data?.status !== "failed" && data?.status !== "canceled"; i++) {
    if (!data?.urls?.get) break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const poll = await fetch(data.urls.get, { headers: { Authorization: `Bearer ${provider.apiKey}` } });
    if (!poll.ok) break;
    data = await poll.json();
  }
  if (data?.status === "failed" || data?.status === "canceled")
    return providerFail({ provider: "replicate", model, endpoint: `${REPLICATE}/${model}/predictions`, status: 502, rawBody: JSON.stringify(data).slice(0, 20000), code: "PROVIDER_ERROR" });
  const url = firstUrl(data?.output ?? data);
  if (url) return Response.json({ image: url });
  return providerFail({ provider: "replicate", model, endpoint: `${REPLICATE}/${model}/predictions`, status: 502, rawBody: JSON.stringify(data).slice(0, 20000), code: "PROVIDER_ERROR" });
}

async function generateWithRecraft(body: Body, provider: Provider): Promise<Response> {
  const model = provider.imageModel && provider.imageModel.toLowerCase().startsWith("recraft")
    ? provider.imageModel
    : "recraftv4_1_utility_pro";
  const upstream = await fetch(RECRAFT, {
    method: "POST",
    headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: body.prompt,
      model,
      size: "2688x1536",
      response_format: "url",
      n: 1,
    }),
  });
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    const status = upstream.status;
    logProviderCall("recraft", model, provider.apiKey, status, false, text);
    return providerFail({ provider: "recraft", model, endpoint: RECRAFT, status, rawBody: text, headers: upstream.headers });
  }
  const data = await upstream.json();
  const b64 = data?.data?.[0]?.b64_json;
  const url = firstUrl(data?.data) ?? firstUrl(data);
  logProviderCall("recraft", model, provider.apiKey, upstream.status, true, url ? "url image" : b64 ? "b64 image" : "no image");
  if (b64) return Response.json({ image: `data:image/png;base64,${b64}` });
  if (url) return Response.json({ image: url });
  return providerFail({ provider: "recraft", model, endpoint: RECRAFT, status: 502, rawBody: JSON.stringify(data).slice(0, 20000), code: "PROVIDER_ERROR" });
}

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = (await request.json()) as Body & ListBody;
        // Diagnostic action: list available Gemini models for a key.
        if (raw.action === "listGeminiModels") return listGeminiModels(raw.apiKey ?? "");
        // Diagnostic action: full raw Gemini connection diagnostics (no content).
        if (raw.action === "geminiDiagnostics")
          return geminiDiagnostics(raw.apiKey ?? "", raw.imageModel);
        // Diagnostic action: comprehensive image-provider PASS/FAIL checks.
        if (raw.action === "geminiImageDiagnostics")
          return geminiImageDiagnostics(raw.apiKey, raw.imageModel);
        const body = raw as Body;
        const { provider } = body;
        if (!provider?.name) return jsonError(PROVIDER_REQUIRED, 400, "NO_PROVIDER");

        // Provider test: smallest possible validation request, never a full image.
        if (body.test) return validateProvider(provider);
        if (!body.prompt?.trim()) return jsonError("Missing prompt", 400, "BAD_REQUEST");

        console.log("[image] request received", {
          provider: provider.name,
          model: provider.imageModel ?? "(default)",
          test: !!body.test,
          references: (body.references ?? []).length,
        });

        if (!provider.apiKey) return jsonError(PROVIDER_REQUIRED, 400, "NO_PROVIDER");
        if (provider.name === "recraft") return generateWithRecraft(body, provider);
        if (provider.name === "gemini") return generateWithGemini(body, provider);
        if (provider.name === "openai") return generateWithOpenAI(body, provider);
        if (provider.name === "fal") return generateWithFal(body, provider);
        if (provider.name === "replicate") return generateWithReplicate(body, provider);
        return jsonError(PROVIDER_REQUIRED, 400, "NO_PROVIDER");
      },
    },
  },
});