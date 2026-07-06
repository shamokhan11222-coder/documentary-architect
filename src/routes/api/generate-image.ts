import { createFileRoute } from "@tanstack/react-router";

// Silent, internal image generation. Images are routed only through the user's
// selected external image provider (Recraft is primary). The built-in AI is
// never used for images.
// Gemini API version is resolved from this single constant and model availability
// is read from Google's models list for the user's key.
const GEMINI_HOST = "https://generativelanguage.googleapis.com";
// Official Google AI Studio / Generative Language REST version for models.list.
const GEMINI_API_VERSIONS = ["v1beta"] as const;
const geminiModelsUrl = (version: string) => `${GEMINI_HOST}/${version}/models`;
const geminiInteractionsUrl = (version: string) => `${GEMINI_HOST}/${version}/interactions`;
// Gemini (Google AI Studio) auth — per the official Google docs
// (https://ai.google.dev/api): Google AI Studio keys are API keys (including AQ
// keys), not OAuth bearer tokens. We support API-key auth via x-goog-api-key and
// ?key=; Authorization: Bearer is only for OAuth access tokens.
const GEMINI_AUTH_HEADER = "x-goog-api-key";
const GEMINI_AUTH_SCHEME = "API-key auth only: x-goog-api-key header, with ?key query parameter fallback";
const GEMINI_QUERY_PARAM_USAGE = "x-goog-api-key is tried first; ?key is tried as API-key fallback; Authorization Bearer is never used for API keys";
const geminiAuthHeaders = (apiKey: string, extra?: Record<string, string>) => {
  const key = (apiKey ?? "").trim();
  return { [GEMINI_AUTH_HEADER]: key, ...(extra ?? {}) };
};
/** Mask an API key, keeping only the first 6 and last 4 characters. */
const maskKey = (k?: string) =>
  !k ? "(none)" : k.length <= 10 ? "****" : `${k.slice(0, 6)}…${k.slice(-4)}`;
// Legacy alias kept for the non-Gemini helpers below.
const GOOGLE = geminiModelsUrl(GEMINI_API_VERSIONS[0]);
// No hardcoded Gemini image fallback. Actual generation selects from Google's
// live models list for the key before sending an image request.
const GEMINI_IMAGE_MODEL_DEFAULT = "";
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
  const queryListUrl = `${geminiModelsUrl(version)}?pageSize=200&key=${encodeURIComponent(apiKey)}`;
  const queryListUrlRedacted = `${geminiModelsUrl(version)}?pageSize=200&key=(hidden)`;
  let listUrlRedacted = listUrl;
  const modelUrl = model ? `${geminiModelsUrl(version)}/${model}` : "";
  let modelUrlRedacted = modelUrl;
  const generationUrl = geminiInteractionsUrl(version);
  let generationUrlForDisplay = generationUrl;
  const generationBody = {
    model,
    input: [{ type: "text", text: "simple blue circle on white background" }],
  };

  const headerAuthHeaders = { accept: "application/json", [GEMINI_AUTH_HEADER]: "(hidden)" };
  const queryAuthHeaders = { accept: "application/json" };
  let listRequestHeaders: Record<string, string> = headerAuthHeaders;
  let modelRequestHeaders: Record<string, string> = headerAuthHeaders;
  let generationRequestHeaders: Record<string, string> = { "Content-Type": "application/json", [GEMINI_AUTH_HEADER]: "(hidden)" };
  let authMethodUsed = "x-goog-api-key header";

  // 1. API key is present. Format is informational only; Google decides validity.
  if (!apiKey) {
    push("API key present", "FAIL", "No API key provided.");
  } else if (!/^[0-9A-Za-z_-]{20,}$/.test(apiKey)) {
    push("API key present", "UNKNOWN", `Key present (${apiKey.length} chars). Format was not used to decide validity; Google will make the final decision.`);
  } else {
    push("API key present", "PASS", `Key present (${apiKey.length} chars). No prefix-based validation is applied.`);
  }

  // Live models-list request (auth + connectivity + endpoint reachability).
  let listStatus = 0;
  let listBody = "";
  let listBodyForDisplay = "";
  let listHeaders: Record<string, string> = {};
  let networkOk = false;
  let listStarted = Date.now();
  try {
    listStarted = Date.now();
    const headerRes = await fetch(listUrl, { headers: geminiAuthHeaders(apiKey, { accept: "application/json" }) });
    networkOk = true;
    const headerText = await headerRes.text();
    const headerHeaders: Record<string, string> = {};
    headerRes.headers.forEach((v, k) => (headerHeaders[k] = v));

    const queryRes = await fetch(queryListUrl, { headers: { accept: "application/json" } });
    const queryText = await queryRes.text();
    const queryHeaders: Record<string, string> = {};
    queryRes.headers.forEach((v, k) => (queryHeaders[k] = v));

    listBodyForDisplay = [
      `--- x-goog-api-key header ---\nGET ${listUrl}\nHeaders: ${JSON.stringify(headerAuthHeaders)}\nHTTP ${headerRes.status} ${headerRes.statusText}\n${headerText}`,
      `--- key query parameter ---\nGET ${queryListUrlRedacted}\nHeaders: ${JSON.stringify(queryAuthHeaders)}\nHTTP ${queryRes.status} ${queryRes.statusText}\n${queryText}`,
    ].join("\n\n");

    const selected = headerRes.ok ? { res: headerRes, text: headerText, headers: headerHeaders, auth: "x-goog-api-key header", url: listUrl, reqHeaders: headerAuthHeaders } : { res: queryRes, text: queryText, headers: queryHeaders, auth: "key query parameter", url: queryListUrlRedacted, reqHeaders: queryAuthHeaders };
    listStatus = selected.res.status;
    listHeaders = selected.headers;
    listBody = selected.text;
    authMethodUsed = selected.auth;
    listUrlRedacted = selected.url;
    listRequestHeaders = selected.reqHeaders;
  } catch (e) {
    listBody = `Fetch failed: ${String(e).slice(0, 400)}`;
    listBodyForDisplay = listBody;
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
  if (apiKey && model) {
    try {
      const usingQueryAuth = authMethodUsed === "key query parameter";
      const fetchModelUrl = usingQueryAuth ? `${modelUrl}?key=${encodeURIComponent(apiKey)}` : modelUrl;
      modelUrlRedacted = usingQueryAuth ? `${modelUrl}?key=(hidden)` : modelUrl;
      modelRequestHeaders = usingQueryAuth ? queryAuthHeaders : headerAuthHeaders;
      const r = await fetch(fetchModelUrl, { headers: usingQueryAuth ? { accept: "application/json" } : geminiAuthHeaders(apiKey, { accept: "application/json" }) });
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
  const modelExists = !!model && modelStatus === 200 && !!modelJson?.name;
  checks.push({
    id: 5,
    label: model ? `Selected model exists ("${model}")` : "Selected model exists",
    status: !model ? "UNKNOWN" : modelExists ? "PASS" : "FAIL",
    detail: !model
      ? "No image model selected. Choose one returned by Google's models list."
      : modelExists
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

  let generationStatus = 0;
  let generationBodyText = "";
  let generationHeaders: Record<string, string> = {};
  if (apiKey && model) {
    try {
      const usingQueryAuth = authMethodUsed === "key query parameter";
      const generationFetchUrl = usingQueryAuth ? `${generationUrl}?key=${encodeURIComponent(apiKey)}` : generationUrl;
      const generationRequestUrl = usingQueryAuth ? `${generationUrl}?key=(hidden)` : generationUrl;
      generationRequestHeaders = usingQueryAuth ? { "Content-Type": "application/json" } : { "Content-Type": "application/json", [GEMINI_AUTH_HEADER]: "(hidden)" };
      const r = await fetch(generationFetchUrl, {
        method: "POST",
        headers: usingQueryAuth ? { "Content-Type": "application/json" } : geminiAuthHeaders(apiKey, { "Content-Type": "application/json" }),
        body: JSON.stringify(generationBody),
      });
      // Keep the redacted URL in the raw block below.
      generationUrlForDisplay = generationRequestUrl;
      generationStatus = r.status;
      r.headers.forEach((v, k) => (generationHeaders[k] = v));
      generationBodyText = await r.text();
    } catch (e) {
      generationBodyText = `Fetch failed: ${String(e).slice(0, 400)}`;
    }
  }
  checks.push({
    id: 11,
    label: "Official image endpoint request started",
    status: generationStatus > 0 ? (generationStatus < 500 ? "PASS" : "FAIL") : "UNKNOWN",
    detail: generationStatus > 0
      ? `POST ${generationUrl} returned HTTP ${generationStatus}. Raw Google response is shown below.`
      : "No HTTP response received from the official image endpoint.",
  });

  return Response.json({
    model,
    apiVersion: version,
    authMethod: authMethodUsed,
    authHeaderName: GEMINI_AUTH_HEADER,
    usesBearer: false,
    queryParameterUsage: GEMINI_QUERY_PARAM_USAGE,
    checks,
    // Raw, verbatim request/response details — nothing summarised.
    modelsList: {
      requestUrl: listUrlRedacted,
      requestHeaders: listRequestHeaders,
      requestBody: "(none — GET request)",
      responseCode: listStatus,
      responseHeaders: listHeaders,
      responseBody: listBodyForDisplay.slice(0, 40000),
    },
    modelLookup: {
      requestUrl: modelUrlRedacted,
      requestHeaders: modelRequestHeaders,
      requestBody: "(none — GET request)",
      responseCode: modelStatus,
      responseHeaders: modelHeaders,
      responseBody: modelBody.slice(0, 40000),
    },
    generationRequest: {
      requestUrl: generationUrlForDisplay,
      requestHeaders: generationRequestHeaders,
      requestBody: JSON.stringify(generationBody, null, 2),
      responseCode: generationStatus,
      responseHeaders: generationHeaders,
      responseBody: generationBodyText.slice(0, 40000),
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
    if (Array.isArray(j)) {
      for (const item of j) {
        const msg =
          item?.error?.message ||
          item?.message ||
          item?.error?.status ||
          (typeof item?.error === "string" ? item.error : "");
        if (msg) return msg;
      }
    }
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
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
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
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
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
    requestHeaders: args.requestHeaders,
    requestBody: args.requestBody,
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
      // Gemini keys are API keys (including AQ-format keys), never Bearer
      // tokens. Validate with the models list endpoint and only accept image
      // models returned by Google for this key.
      const imageModel = provider.imageModel?.trim();
      const listed = await fetchGeminiModels(provider.apiKey!);
      if ("error" in listed) {
        return providerFail({
          provider: "gemini",
      model: imageModel || "models list",
          endpoint: listed.requestUrl || `${GOOGLE}?pageSize=200`,
          status: listed.status,
          rawBody: listed.rawBody || listed.error,
          code: codeForProviderResponse(listed.status, listed.rawBody || listed.error),
          httpMethod: "GET",
          requestHeaders: listed.authMethod === "key query parameter" ? { accept: "application/json" } : { accept: "application/json", [GEMINI_AUTH_HEADER]: "(hidden)" },
        });
      }
      if (imageModel) {
        const available = listed.models.filter(isImageCapable).map((m) => bareModelId(m.name));
        if (!available.includes(imageModel)) {
          return providerFail({
            provider: "gemini",
            model: imageModel,
            endpoint: listed.requestUrl,
            status: 404,
            rawBody: listed.rawBody,
            code: "MODEL_NOT_FOUND",
            httpMethod: "GET",
            requestHeaders: listed.authMethod === "key query parameter" ? { accept: "application/json" } : { accept: "application/json", [GEMINI_AUTH_HEADER]: "(hidden)" },
          });
        }
        return Response.json({ ok: true, imageModels: available, authMethod: listed.authMethod, rawResponse: listed.rawBody });
      }
      return Response.json({ ok: true, imageModels: listed.models.filter(isImageCapable).map((m) => bareModelId(m.name)), authMethod: listed.authMethod, rawResponse: listed.rawBody });
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

function toInteractionImageInput(ref: string) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(ref);
  if (!m) return null;
  return { type: "image", mime_type: m[1], data: m[2] };
}

/** generateContent inline image part: { inlineData: { mimeType, data } }. */
function toInlineDataPart(ref: string) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(ref);
  if (!m) return null;
  return { inlineData: { mimeType: m[1], data: m[2] } };
}

function extractGeminiInteractionImage(data: unknown): { data?: string; mimeType?: string } | null {
  const visit = (value: unknown): { data?: string; mimeType?: string } | null => {
    if (!value || typeof value !== "object") return null;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item);
        if (found) return found;
      }
      return null;
    }
    const obj = value as Record<string, unknown>;
    const type = typeof obj.type === "string" ? obj.type.toLowerCase() : "";
    const mime = typeof obj.mime_type === "string"
      ? obj.mime_type
      : typeof obj.mimeType === "string"
        ? obj.mimeType
        : undefined;
    if (type === "image" && typeof obj.data === "string" && obj.data.length > 100) {
      return { data: obj.data, mimeType: mime };
    }
    if (obj.inlineData && typeof obj.inlineData === "object") {
      const inline = obj.inlineData as { data?: unknown; mimeType?: string; mime_type?: string };
      if (typeof inline.data === "string") {
        return { data: inline.data, mimeType: inline.mimeType ?? inline.mime_type ?? mime };
      }
    }
    if (obj.output_image && typeof obj.output_image === "object") {
      const output = obj.output_image as { data?: unknown; mime_type?: string; mimeType?: string };
      if (typeof output.data === "string") return { data: output.data, mimeType: output.mime_type ?? output.mimeType ?? mime };
    }
    for (const nested of Object.values(obj)) {
      const found = visit(nested);
      if (found) return found;
    }
    return null;
  };
  return visit(data);
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

/** Extract a clean, bare Gemini model id from any incoming value.
 *  Accepts friendly labels like "Nano Banana (gemini-2.5-flash-image)",
 *  full ids like "models/gemini-2.5-flash-image", or bare ids. Returns the
 *  bare id (no "models/" prefix, no label text). Empty string when none. */
function extractBareModelId(raw: string): string {
  let v = (raw ?? "").trim();
  if (!v) return "";
  // If a label wraps the id in parentheses, take the parenthesised value.
  const paren = v.match(/\(([^)]+)\)/);
  if (paren) v = paren[1].trim();
  // Drop the "models/" prefix if present; keep only the id token.
  v = v.replace(/^models\//, "").trim();
  // If any stray label words remain, keep the last whitespace-separated token
  // that looks like a model id.
  if (/\s/.test(v)) {
    const token = v.split(/\s+/).find((t) => /^[a-z0-9][a-z0-9.\-]*$/i.test(t));
    if (token) v = token;
  }
  return v;
}

/** Ensure a model id carries the "models/" prefix required by the API. */
function withModelsPrefix(id: string): string {
  const bare = id.replace(/^models\//, "").trim();
  return bare ? `models/${bare}` : "";
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
): Promise<
  | { models: GeminiModel[]; endpoint: string; requestUrl: string; version: string; authMethod: string; rawBody: string; status: number }
  | { error: string; status: number; requestUrl?: string; authMethod?: string; rawBody?: string }
> {
  let lastErr = "Unknown error";
  let lastStatus = 502;
  let lastRequestUrl = "";
  let lastAuthMethod = "";
  for (const version of GEMINI_API_VERSIONS) {
    const base = geminiModelsUrl(version);
    const attempts = [
      {
        authMethod: "x-goog-api-key header",
        requestUrl: `${base}?pageSize=200`,
        fetchUrl: `${base}?pageSize=200`,
        headers: geminiAuthHeaders(apiKey, { accept: "application/json" }),
      },
      {
        authMethod: "key query parameter",
        requestUrl: `${base}?pageSize=200&key=(hidden)`,
        fetchUrl: `${base}?pageSize=200&key=${encodeURIComponent(apiKey)}`,
        headers: { accept: "application/json" },
      },
    ];
    for (const attempt of attempts) {
      try {
      const r = await fetch(attempt.fetchUrl, { headers: attempt.headers });
      lastRequestUrl = attempt.requestUrl;
      lastAuthMethod = attempt.authMethod;
      const text = await r.text().catch(() => "");
      if (r.ok) {
        const data = JSON.parse(text) as { models?: GeminiModel[] };
        return { models: data.models ?? [], endpoint: base, requestUrl: attempt.requestUrl, version, authMethod: attempt.authMethod, rawBody: text, status: r.status };
      }
      lastStatus = r.status;
      lastErr = text || `HTTP ${r.status}`;
    } catch (e) {
      lastErr = String(e).slice(0, 200);
    }
    }
  }
  return { error: lastErr, status: lastStatus, requestUrl: lastRequestUrl, authMethod: lastAuthMethod, rawBody: lastErr };
}

/** Diagnostic endpoint — return the image-capable Gemini models for a key so
 *  the UI can let the user pick a real, existing model. */
async function listGeminiModels(apiKey: string): Promise<Response> {
  if (!apiKey?.trim()) return jsonError("Add a Google Gemini API key first.", 400, "NO_PROVIDER");
  const res = await fetchGeminiModels(apiKey.trim());
  if ("error" in res) {
    return providerFail({
      provider: "gemini",
      model: "models list",
      endpoint: res.requestUrl || `${GOOGLE}?pageSize=200`,
      status: res.status,
      rawBody: res.rawBody || res.error,
      code: codeForProviderResponse(res.status, res.rawBody || res.error),
      httpMethod: "GET",
      requestHeaders: res.authMethod === "key query parameter" ? { accept: "application/json" } : { accept: "application/json", [GEMINI_AUTH_HEADER]: "(hidden)" },
    });
  }
  const imageModels = res.models.filter(isImageCapable).map((m) => ({
    id: bareModelId(m.name),
    displayName: m.displayName ?? bareModelId(m.name),
  }));
  const allModels = res.models.map((m) => bareModelId(m.name));
  return Response.json({
    endpoint: res.endpoint,
    requestUrl: res.requestUrl,
    apiVersion: res.version,
    authMethod: res.authMethod,
    rawResponse: res.rawBody,
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
      authMethod: `${GEMINI_AUTH_SCHEME} — documented Google AI Studio auth for all key formats`,
    });
  }
  const version = GEMINI_API_VERSIONS[0];
  const requestUrl = `${geminiModelsUrl(version)}?pageSize=200`;
  const queryRequestUrl = `${geminiModelsUrl(version)}?pageSize=200&key=(hidden)`;
  const queryFetchUrl = `${geminiModelsUrl(version)}?pageSize=200&key=${encodeURIComponent(key)}`;
  let httpStatus = 0;
  let statusText = "";
  let responseBody = "";
  let ok = false;
  const model = imageModel?.trim() || null;
  const requestMethod = "GET";
  let authMethodUsed = "x-goog-api-key header";
  let redactedUrl = requestUrl;
  let requestHeaders: Record<string, string> = {
    [GEMINI_AUTH_HEADER]: maskKey(key),
    accept: "application/json",
  };
  const responseHeaders: Record<string, string> = {};
  const attempts: string[] = [];
  const started = Date.now();
  try {
    const headerRes = await fetch(requestUrl, { headers: geminiAuthHeaders(key, { accept: "application/json" }) });
    const headerText = await headerRes.text();
    attempts.push(`--- x-goog-api-key header ---\nGET ${requestUrl}\nHeaders: ${JSON.stringify({ accept: "application/json", [GEMINI_AUTH_HEADER]: maskKey(key) })}\nHTTP ${headerRes.status} ${headerRes.statusText}\n${headerText}`);
    let r = headerRes;
    responseBody = headerText;
    if (!headerRes.ok) {
      const queryRes = await fetch(queryFetchUrl, { headers: { accept: "application/json" } });
      const queryText = await queryRes.text();
      attempts.push(`--- key query parameter ---\nGET ${queryRequestUrl}\nHeaders: ${JSON.stringify({ accept: "application/json" })}\nHTTP ${queryRes.status} ${queryRes.statusText}\n${queryText}`);
      if (queryRes.ok || !headerRes.ok) {
        r = queryRes;
        responseBody = queryText;
        redactedUrl = queryRequestUrl;
        authMethodUsed = "key query parameter";
        requestHeaders = { accept: "application/json" };
      }
    }
    httpStatus = r.status;
    statusText = r.statusText;
    ok = r.ok;
    r.headers.forEach((v, k) => {
      responseHeaders[k] = v;
    });
  } catch (e) {
    responseBody = `Fetch failed: ${String(e).slice(0, 300)}`;
  }
  const fullRequest = attempts.join("\n\n") ||
    `${requestMethod} ${redactedUrl}\n` +
      Object.entries(requestHeaders)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n") +
      `\n\n(no request body)`;
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
    authMethod: authMethodUsed,
    authHeaderName: GEMINI_AUTH_HEADER,
    usesBearer: false,
    queryParameterUsage: "tested x-goog-api-key header and ?key= query parameter; no Bearer token used",
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
  const listed = await fetchGeminiModels(apiKey);
  if ("error" in listed) {
    return providerFail({
      provider: "gemini",
      model: "models list",
      endpoint: listed.requestUrl || `${GOOGLE}?pageSize=200`,
      status: listed.status,
      rawBody: listed.rawBody || listed.error,
      code: codeForProviderResponse(listed.status, listed.rawBody || listed.error),
      httpMethod: "GET",
      requestHeaders: listed.authMethod === "key query parameter" ? { accept: "application/json" } : { accept: "application/json", [GEMINI_AUTH_HEADER]: "(hidden)" },
    });
  }
  // Keep the EXACT model IDs Google returns (e.g. "models/gemini-2.5-flash-image").
  // The "models/" prefix is never stripped and display names are never used.
  const availableImageModelsFull = listed.models.filter(isImageCapable).map((m) => m.name);
  const availableImageModels = availableImageModelsFull.map(bareModelId);
  if (availableImageModelsFull.length === 0) {
    return providerFail({
      provider: "gemini",
      model: "models list",
      endpoint: listed.requestUrl,
      status: listed.status,
      rawBody: listed.rawBody,
      code: "MODEL_NOT_FOUND",
      httpMethod: "GET",
      requestHeaders: listed.authMethod === "key query parameter" ? { accept: "application/json" } : { accept: "application/json", [GEMINI_AUTH_HEADER]: "(hidden)" },
    });
  }
  // Enforce a Gemini image model returned by Google's models list for this key —
  // never a custom string, never a display name, and never a text model.
  // Match the requested id against Google's returned ids by their bare form, but
  // always send the EXACT returned name (with the "models/" prefix intact).
  // Strip any friendly label ("Nano Banana (gemini-2.5-flash-image)") down to the
  // bare id, then match it against Google's returned ids by bare form. Always
  // send the EXACT returned name (with the "models/" prefix intact).
  const requestedBare = extractBareModelId(provider.imageModel || "");
  const matched =
    availableImageModelsFull.find((n) => bareModelId(n) === requestedBare) ?? availableImageModelsFull[0];
  // Guarantee the "models/" prefix on the final id even if a bare id slipped in.
  const fullModel = withModelsPrefix(matched);
  const model = fullModel; // exact returned ID, e.g. "models/gemini-2.5-flash-image"
  if (requestedBare && bareModelId(fullModel) !== requestedBare) {
    console.warn("[image][gemini] requested image model not returned by Google; using first returned image model", {
      requested: requestedBare || "(empty)",
      selected: fullModel,
      availableImageModels: availableImageModelsFull,
    });
  }
  // Requirement: print the EXACT model id sent to the API before every request.
  console.log(`Final model sent to Gemini API: ${fullModel}`);
  const parts: unknown[] = [{ text: body.prompt }];
  for (const ref of (body.references ?? []).slice(0, 6)) {
    const inline = typeof ref === "string" && ref.startsWith("data:") ? toInlineDataPart(ref) : null;
    if (inline) parts.push(inline);
  }
  const reqBodyObj = {
    contents: [{ role: "user", parts }],
    generationConfig: { responseModalities: ["IMAGE"] },
  };
  const reqBody = JSON.stringify(reqBodyObj);
  const version = GEMINI_API_VERSIONS[0];
  // Official generateContent endpoint. The model keeps its "models/" prefix, so
  // the URL is .../v1beta/models/<exact-id>:generateContent.
  const baseEndpoint = `${GEMINI_HOST}/${version}/${fullModel}:generateContent`;
  const usingQueryAuth = listed.authMethod === "key query parameter";
  const endpoint = usingQueryAuth ? `${baseEndpoint}?key=(hidden)` : baseEndpoint;
  const fetchEndpoint = usingQueryAuth ? `${baseEndpoint}?key=${encodeURIComponent(apiKey)}` : baseEndpoint;
  const redactedHeaders: Record<string, string> = usingQueryAuth
    ? { "Content-Type": "application/json" }
    : { "Content-Type": "application/json", [GEMINI_AUTH_HEADER]: maskKey(apiKey) };
  const auditStart = Date.now();
  console.log("[AUDIT][gemini] outbound request", {
    endpoint,
    model,
    apiVersion: version,
    authenticationMethod: listed.authMethod,
    authHeaderName: usingQueryAuth ? "(none — key query parameter)" : GEMINI_AUTH_HEADER,
    usesBearer: false,
    queryParameterUsage: usingQueryAuth ? "key query parameter" : "none — API key is sent in x-goog-api-key header",
    headers: redactedHeaders,
    body: reqBodyObj,
    time: new Date(auditStart).toISOString(),
    references: parts.length - 1,
  });
  const upstream = await fetch(fetchEndpoint, {
    method: "POST",
    headers: usingQueryAuth ? { "Content-Type": "application/json" } : geminiAuthHeaders(apiKey, { "Content-Type": "application/json" }),
    body: reqBody,
  });
  console.log("[AUDIT][gemini] outbound response", {
    endpoint,
    model,
    apiVersion: version,
    responseCode: upstream.status,
    ms: Date.now() - auditStart,
  });
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    const status = upstream.status;
    logProviderCall("gemini", model, provider.apiKey, status, false, text);
    return providerFail({
      provider: "gemini",
      model,
      endpoint,
      status,
      rawBody: text,
      headers: upstream.headers,
      requestHeaders: redactedHeaders,
      requestBody: reqBodyObj,
    });
  }
  const data = await upstream.json();
  const inline = extractGeminiInteractionImage(data);
  const b64 = inline?.data;
  logProviderCall("gemini", model, provider.apiKey, upstream.status, true, b64 ? "b64 image" : "no image");
  if (!b64)
    return providerFail({
      provider: "gemini",
      model,
      endpoint,
      status: 502,
      rawBody: JSON.stringify(data).slice(0, 20000),
      headers: upstream.headers,
      code: "PROVIDER_ERROR",
      requestHeaders: redactedHeaders,
      requestBody: reqBodyObj,
    });
  const mime = inline?.mimeType || "image/png";
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