// Server-side helpers. Keys live in Vercel env vars and never reach the browser.
//
// Any OpenAI-compatible provider works. The first one with a key set wins:
//   Nebius Token Factory (required for the Nebius x NVIDIA submission) -> NVIDIA API catalog -> Gemini -> Groq.
// Model ids per provider can be overridden with ATLAS_VISION_MODEL / ATLAS_AGENT_MODEL / ATLAS_FAST_MODEL.

interface Provider { id: string; label: string; base: string; key?: string; vision: string; agent: string; fast: string; prefer?: Record<'vision' | 'agent' | 'fast', RegExp[]>; native?: 'gemini' }

// Providers retire model ids (Gemini 2.5 shut down on 16 Oct 2026). When the configured id is not
// in the provider's live model list, the first id matching these patterns, in order, is used.
const GEMINI_PREFER = [/^gemini-3(\.\d)?-flash$/, /^gemini-flash-latest$/, /^gemini-3(\.\d)?-flash-preview$/, /^gemini-flash-lite-latest$/, /^gemini-3(\.\d)?-flash-lite$/, /^gemini-[\d.]+-flash$/];
const NEMOTRON_PREFER = {
  vision: [/nemotron.*vl/i, /vl/i],
  agent: [/nemotron.*super/i, /nemotron.*ultra/i, /nemotron/i],
  fast: [/nemotron.*lightning/i, /nemotron.*nano/i, /nemotron/i],
};

const PROVIDERS: Provider[] = [
  { id: 'nebius', label: 'Nebius Token Factory', base: process.env.TOKEN_FACTORY_URL || 'https://api.tokenfactory.nebius.com/v1', key: process.env.NEBIUS_API_KEY,
    vision: 'nvidia/Nemotron-3.5-Super-VL', agent: 'nvidia/nemotron-3-super-120b-a12b', fast: 'nvidia/Nemotron-3-Nano-30B-A3B', prefer: NEMOTRON_PREFER },
  { id: 'nvidia', label: 'NVIDIA API catalog', base: 'https://integrate.api.nvidia.com/v1', key: process.env.NVIDIA_API_KEY,
    vision: 'nvidia/nemotron-3.5-super-vl-120b-a12b', agent: 'nvidia/nemotron-3.5-super-vl-120b-a12b', fast: 'nvidia/nemotron-3.5-lightning-30b-a3b', prefer: NEMOTRON_PREFER },
  // AI Studio now issues `AQ.` auth keys, which the OpenAI-compatible endpoint rejects.
  // Native generateContent accepts them, so Gemini gets its own transport.
  { id: 'gemini', label: 'Gemini', base: 'https://generativelanguage.googleapis.com/v1beta', key: process.env.GEMINI_API_KEY,
    vision: 'gemini-3.5-flash', agent: 'gemini-3.5-flash', fast: 'gemini-3.5-flash-lite', native: 'gemini', prefer: { vision: GEMINI_PREFER, agent: GEMINI_PREFER, fast: GEMINI_PREFER } },
  { id: 'groq', label: 'Groq', base: 'https://api.groq.com/openai/v1', key: process.env.GROQ_API_KEY,
    vision: 'meta-llama/llama-4-scout-17b-16e-instruct', agent: 'openai/gpt-oss-120b', fast: 'openai/gpt-oss-20b' },
];

export const PROVIDER: Provider | undefined = PROVIDERS.find((p) => p.key);

/**
 * A keyless, server-side fallback for the small explanation model.
 *
 * Pollinations exposes an OpenAI-compatible, anonymous endpoint that serves open-weight models
 * (currently gpt-oss-20b). It is used only when no NVIDIA/Nebius/Gemini/Groq key is configured,
 * and only for the trend explainer: a low-stakes, two-sentence rewrite of numbers that ATLAS has
 * already computed. The deterministic explanation remains the fallback if this server is down.
 * Set ATLAS_KEYLESS_MODEL=off to disable it, or any model id to pin another one.
 */
const KEYLESS_OFF = /^(off|none|0|false)$/i.test(process.env.ATLAS_KEYLESS_MODEL || '');
export const KEYLESS = KEYLESS_OFF ? null : {
  id: 'pollinations',
  label: 'Pollinations · open model (keyless)',
  base: 'https://text.pollinations.ai/openai',
  model: process.env.ATLAS_KEYLESS_MODEL || 'openai',
};

export const MODELS = {
  vision: process.env.ATLAS_VISION_MODEL || PROVIDER?.vision || 'unset',
  agent: process.env.ATLAS_AGENT_MODEL || PROVIDER?.agent || 'unset',
  fast: process.env.ATLAS_FAST_MODEL || PROVIDER?.fast || KEYLESS?.model || 'unset',
};

const configured = { ...MODELS };
/** Live ids that match each role's preferences, best first: fallbacks when one is overloaded. */
/** Model ids the provider lists right now (Nemotron / Gemini only), for /api/status. */
export const LIVE_IDS: string[] = [];
export const ALTS: Record<'vision' | 'agent' | 'fast', string[]> = { vision: [], agent: [], fast: [] };
let checked: Promise<void> | null = null;

/**
 * Check the configured ids against the provider's live model list once per instance and swap any
 * retired id for the best available match. Explicit ATLAS_*_MODEL overrides are never replaced.
 */
export function ensureModels() {
  if (!PROVIDER?.prefer) return Promise.resolve();
  checked ??= (async () => {
    try {
      const native = PROVIDER!.native === 'gemini';
      const r = await fetch(`${PROVIDER!.base}/models`, {
        headers: native ? { 'x-goog-api-key': PROVIDER!.key! } : { Authorization: `Bearer ${PROVIDER!.key}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) return;
      const j = (await r.json()) as { data?: { id: string }[]; models?: { name: string }[] };
      const raw = native ? (j.models || []).map((m) => m.name) : (j.data || []).map((m) => m.id);
      const ids = raw.map((m) => m.replace(/^models\//, ''));
      LIVE_IDS.splice(0, LIVE_IDS.length, ...ids.filter((id) => /nemotron|gemini/i.test(id)).slice(0, 60));
      if (!ids.length) return;
      for (const role of ['vision', 'agent', 'fast'] as const) {
        const env = { vision: process.env.ATLAS_VISION_MODEL, agent: process.env.ATLAS_AGENT_MODEL, fast: process.env.ATLAS_FAST_MODEL }[role];
        const ranked: string[] = [];
        const usable = ids.filter((id) => !/parse|embed|rerank|reward|safety|guard|retriev|tts|asr|ocr/i.test(id));
        const newest = [...usable].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        for (const re of PROVIDER.prefer![role]) for (const id of newest) if (re.test(id) && !ranked.includes(id)) ranked.push(id);
        ALTS[role] = ranked;
        if (env || ids.includes(MODELS[role])) continue;
        if (ranked[0]) MODELS[role] = ranked[0];
      }
    } catch { /* keep the configured ids */ }
  })();
  return checked;
}

/** Back-compat for the old name. */
export const TOKEN_FACTORY = PROVIDERS[0].base;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
  tool_calls?: unknown[];
  tool_call_id?: string;
  name?: string;
}

interface NativePart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; response: Record<string, unknown> };
  thoughtSignature?: string;
}

function textOf(content: ChatMessage['content']): string {
  return typeof content === 'string' ? content : content.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
}

/** OpenAI image_url parts become Gemini inlineData. ATLAS only sends canvas data URLs. */
function geminiParts(content: ChatMessage['content']): NativePart[] {
  if (typeof content === 'string') return content ? [{ text: content }] : [];
  const parts: NativePart[] = [];
  for (const p of content) {
    if (p.type === 'text') { if (p.text) parts.push({ text: p.text }); continue; }
    const m = /^data:([^;,]+);base64,(.+)$/s.exec(p.image_url.url);
    if (m) parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
    else parts.push({ text: `[image unavailable: ${p.image_url.url.slice(0, 80)}]` });
  }
  return parts;
}

function geminiContents(messages: ChatMessage[]) {
  const system: string[] = [];
  const contents: { role: 'user' | 'model'; parts: NativePart[] }[] = [];
  const push = (role: 'user' | 'model', parts: NativePart[]) => {
    if (!parts.length) return;
    const last = contents[contents.length - 1];
    // Tool results arrive as consecutive `tool` messages; Gemini expects one user turn with
    // one functionResponse part per call. Merge those, and consecutive plain-text user turns.
    if (last?.role === role && role === 'user' && last.parts.every((p) => p.functionResponse) && parts.every((p) => p.functionResponse)) {
      last.parts.push(...parts);
      return;
    }
    if (last?.role === role && role === 'user' && last.parts.every((p) => p.text) && parts.every((p) => p.text)) {
      last.parts.push(...parts);
      return;
    }
    contents.push({ role, parts });
  };
  for (const m of messages) {
    if (m.role === 'system') {
      const text = textOf(m.content);
      if (text) system.push(text);
      continue;
    }
    if (m.role === 'assistant') {
      const parts = geminiParts(m.content);
      for (const raw of (m.tool_calls || []) as { id?: string; thoughtSignature?: string; function?: { name?: string; arguments?: string } }[]) {
        if (!raw.function?.name) continue;
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(raw.function.arguments || '{}'); } catch { /* keep empty */ }
        parts.push({
          functionCall: { name: raw.function.name, args },
          ...(raw.thoughtSignature ? { thoughtSignature: raw.thoughtSignature } : {}),
        });
      }
      push('model', parts);
      continue;
    }
    if (m.role === 'tool') {
      push('user', [{ functionResponse: { name: m.name || 'tool', response: { result: textOf(m.content) } } }]);
      continue;
    }
    push('user', geminiParts(m.content));
  }
  return { contents, systemInstruction: system.length ? { parts: system.map((text) => ({ text })) } : undefined };
}

/** Gemini accepts an OpenAPI subset; drop JSON-Schema keys it rejects. */
function geminiSchema(schema: unknown): Record<string, unknown> | undefined {
  if (!schema || typeof schema !== 'object') return undefined;
  const src = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof src.type === 'string') out.type = src.type;
  if (typeof src.description === 'string') out.description = src.description;
  if (Array.isArray(src.enum)) out.enum = src.enum;
  if (src.items) { const items = geminiSchema(src.items); if (items) out.items = items; }
  if (src.properties && typeof src.properties === 'object') {
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(src.properties as Record<string, unknown>)) {
      const child = geminiSchema(value);
      if (child) props[key] = child;
    }
    out.properties = props;
  }
  if (Array.isArray(src.required) && src.required.length) out.required = src.required;
  return out;
}

function geminiTools(tools: unknown[]) {
  const declarations = tools.map((tool) => {
    const fn = (tool as { function?: { name?: string; description?: string; parameters?: unknown } }).function;
    if (!fn?.name) return null;
    const decl: Record<string, unknown> = { name: fn.name };
    if (fn.description) decl.description = fn.description;
    const params = geminiSchema(fn.parameters);
    if (params?.properties && Object.keys(params.properties as Record<string, unknown>).length) decl.parameters = params;
    return decl;
  }).filter(Boolean);
  return declarations.length ? [{ functionDeclarations: declarations }] : undefined;
}

function geminiToolConfig(choice: unknown) {
  if (!choice) return undefined;
  if (choice === 'none') return { functionCallingConfig: { mode: 'NONE' } };
  if (choice === 'required') return { functionCallingConfig: { mode: 'ANY' } };
  if (typeof choice === 'object') {
    const name = (choice as { function?: { name?: string } }).function?.name;
    return { functionCallingConfig: { mode: 'ANY', ...(name ? { allowedFunctionNames: [name] } : {}) } };
  }
  return { functionCallingConfig: { mode: 'AUTO' } };
}

function geminiPayload(body: Record<string, unknown>, model: string) {
  const { contents, systemInstruction } = geminiContents((body.messages || []) as ChatMessage[]);
  const generationConfig: Record<string, unknown> = {
    // Gemini 3.x thinks at length by default; ATLAS needs short, structured answers.
    thinkingConfig: { thinkingLevel: 'minimal' },
  };
  if (typeof body.temperature === 'number') generationConfig.temperature = body.temperature;
  // Native Gemini counts thinking tokens against maxOutputTokens. Leave room for the answer.
  if (typeof body.max_tokens === 'number') generationConfig.maxOutputTokens = Math.min(Math.max(body.max_tokens * 3, 512), 8192);
  if ((body.response_format as { type?: string } | undefined)?.type === 'json_object') generationConfig.responseMimeType = 'application/json';
  const payload: Record<string, unknown> = { contents, generationConfig };
  if (systemInstruction) payload.systemInstruction = systemInstruction;
  if (Array.isArray(body.tools)) {
    const tools = geminiTools(body.tools);
    if (tools) payload.tools = tools;
  }
  const toolConfig = geminiToolConfig(body.tool_choice);
  if (toolConfig) payload.toolConfig = toolConfig;
  return payload;
}

/** Translate a native Gemini reply into the OpenAI shape the rest of ATLAS consumes. */
function geminiReply(json: Record<string, unknown>, model: string, provider: Provider) {
  const candidate = (json.candidates as { content?: { parts?: NativePart[] }; finishReason?: string }[] | undefined)?.[0];
  const parts = candidate?.content?.parts || [];
  const text = parts.filter((p) => p.text).map((p) => p.text).join('');
  const calls = parts.filter((p) => p.functionCall).map((p, i) => ({
    id: p.functionCall?.id || `call_${Date.now()}_${i}`,
    type: 'function',
    function: { name: p.functionCall!.name, arguments: JSON.stringify(p.functionCall!.args || {}) },
    ...(p.thoughtSignature ? { thoughtSignature: p.thoughtSignature } : {}),
  }));
  const message: Record<string, unknown> = { role: 'assistant', content: text };
  if (calls.length) message.tool_calls = calls;
  const usage = (json.usageMetadata || {}) as { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  return {
    id: json.responseId || '',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: json.modelVersion || model,
    choices: [{ index: 0, message, finish_reason: String(candidate?.finishReason || 'STOP').toLowerCase() }],
    usage: {
      prompt_tokens: usage.promptTokenCount || 0,
      completion_tokens: usage.candidatesTokenCount || 0,
      total_tokens: usage.totalTokenCount || 0,
    },
    servedBy: `${provider.label} · ${model}`,
  };
}

async function postGemini(provider: Provider, model: string, body: Record<string, unknown>, limit: number): Promise<Response> {
  const send = (payload: Record<string, unknown>) => fetch(`${provider.base}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': provider.key! },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(limit),
  });
  const payload = geminiPayload(body, model);
  const r = await send(payload);
  if (r.ok) {
    const json = (await r.json()) as Record<string, unknown>;
    return new Response(JSON.stringify(geminiReply(json, model, provider)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  // Some multimodal Gemini 3 models reject `minimal`; retry with `low` rather than fail the scan.
  if (r.status === 400 && /Thinking level MINIMAL is not supported/i.test(await r.clone().text())) {
    (payload.generationConfig as Record<string, unknown>).thinkingConfig = { thinkingLevel: 'low' };
    const retry = await send(payload);
    if (!retry.ok) return retry;
    const json = (await retry.json()) as Record<string, unknown>;
    return new Response(JSON.stringify(geminiReply(json, model, provider)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return r;
}

export function hasModel() { return !!PROVIDER; }
export function hasKeyless() { return !!KEYLESS; }

const EXHAUSTED = new Map<string, number>();

export async function chat(body: Record<string, unknown>) {
  if (!PROVIDER) throw new HttpError(503, 'No model key is set on the server (NEBIUS_API_KEY, NVIDIA_API_KEY, GEMINI_API_KEY or GROQ_API_KEY)');
  await ensureModels();
  // Callers pass the id they read earlier; map a retired id to its live replacement.
  for (const role of ['vision', 'agent', 'fast'] as const) if (body.model === configured[role]) body.model = MODELS[role];
  // Overloaded (503), rate-limited (429) or retired (404): try the next live model for the role.
  // Gemini 3.x thinks at length by default; structured work here needs speed more than depth.
  if (PROVIDER.id === 'gemini' && body.reasoning_effort === undefined) body.reasoning_effort = 'low';
  const role = (['agent', 'vision', 'fast'] as const).find((k) => body.model === MODELS[k]) ?? 'agent';
  // Overloaded (503), rate-limited or out of quota (429), retired (404): try the next live model,
  // then any other provider that has a key. Each model has its own quota on free tiers.
  const ranked = [String(body.model), ...ALTS[role].filter((id) => id !== body.model)].slice(0, 6);
  // Each model has its own quota on the free tier, so a model from another role can still
  // answer when the agent model is out of quota (for example the lite model).
  for (const other of ['fast', 'agent', 'vision'] as const) {
    if (role === other) continue;
    const id = MODELS[other];
    if (id && id !== 'unset' && !ranked.includes(id)) ranked.push(id);
  }
  const plan: { p: Provider; model: string }[] = ranked.map((model) => ({ p: PROVIDER!, model }));
  for (const other of PROVIDERS) if (other.key && other !== PROVIDER) plan.push({ p: other, model: other[role] });
  let last = '';
  // Models that just said "quota used up" are skipped for a while (per warm instance).
  const live = plan.filter((x) => (EXHAUSTED.get(`${x.p.id}:${x.model}`) ?? 0) < Date.now());
  if (live.length) plan.splice(0, plan.length, ...live);
  for (let i = 0; i < plan.length; i++) {
    const { p, model } = plan[i];
    const payload: Record<string, unknown> = { ...body, model };
    if (p.id !== 'gemini') delete payload.reasoning_effort;
    // Nemotron 3.x reasons at length by default (minutes on long JSON); ATLAS needs fast, structured
    // answers, so thinking is off unless a caller asks for it. NIM / vLLM read chat_template_kwargs.
    if ((p.id === 'nvidia' || p.id === 'nebius') && payload.chat_template_kwargs === undefined) payload.chat_template_kwargs = { enable_thinking: false };
    // Free endpoints occasionally stall a request for minutes: give up on that model and try the next.
    const limit = Number(body.max_tokens ?? 1000) <= 1200 ? 22_000 : 120_000;
    let r: Response;
    try {
      r = p.native === 'gemini'
        ? await postGemini(p, model, body, limit)
        : await fetch(`${p.base}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(limit),
        });
    } catch (err) {
      last = `${p.label} ${model}: no reply in ${limit / 1000} s (${err instanceof Error ? err.name : 'error'})`;
      continue;
    }
    if (r.ok) { const j = await r.json(); j.servedBy = `${p.label} · ${model}`; return j; }
    last = `${p.label} ${r.status}: ${(await r.text()).replace(/\s+/g, ' ').slice(0, 300)}`;
    if (r.status === 429) EXHAUSTED.set(`${p.id}:${model}`, Date.now() + 15 * 60 * 1000);
    if (![404, 429, 500, 503].includes(r.status)) throw new HttpError(r.status, last);
    if (r.status !== 429 && i === 0) await new Promise((res) => setTimeout(res, 600));
  }
  // Every keyed model is out of quota or unavailable. Fall back to the keyless open model so
  // the app still answers; tools are dropped because the anonymous endpoint is text-only.
  if (KEYLESS) {
    try {
      const { tools, tool_choice, ...rest } = body as Record<string, unknown>;
      const j = await chatKeyless({ ...rest, max_tokens: Math.min(Number(body.max_tokens ?? 1000), 900) });
      j.servedBy = `${KEYLESS.label} · ${KEYLESS.model} · keyless fallback`;
      return j;
    } catch { /* the error below is the honest one */ }
  }
  const quota = /\b429\b/.test(last);
  throw new HttpError(503, quota
    ? `The keyed model quota is used up for today (${last.slice(0, 120)}). The keyless fallback did not answer either.`
    : last);
}

/**
 * Keyless text completion for the NASA trend explainer. Same OpenAI-shaped request/response as
 * chat(), so callers can swap the transport without changing their prompt. No images or tools are
 * sent here; the anonymous tier is deliberately used only for short, text-only explanations.
 */
export async function chatKeyless(body: Record<string, unknown>) {
  if (!KEYLESS) throw new HttpError(503, 'Keyless explanations are disabled on this deployment');
  const payload = {
    ...body,
    model: KEYLESS.model,
    // The anonymous tier is rate-limited; a private flag keeps the request out of public feeds.
    private: true,
    referrer: 'https://atlas-ace-azael.vercel.app/',
  };
  let r: Response;
  try {
    r = await fetch(KEYLESS.base, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ATLAS-EARTH/1.0 (NASA Space Apps 2026, Team Ace Azael)',
        Referer: 'https://atlas-ace-azael.vercel.app/',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(50_000),
    });
  } catch (err) {
    throw new HttpError(503, `The keyless explanation model did not respond (${err instanceof Error ? err.name : 'error'})`);
  }
  if (!r.ok) {
    throw new HttpError(503, `The keyless explanation model answered ${r.status}: ${(await r.text()).replace(/\s+/g, ' ').slice(0, 200)}`);
  }
  const j = await r.json();
  j.servedBy = `${KEYLESS.label} · ${j.model || 'open model'}`;
  return j as { choices?: Array<{ message?: { content?: string } }>; servedBy: string; [k: string]: unknown };
}

export async function tavily(query: string, maxResults = 4) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return { results: [] as TavilyResult[], answer: null as string | null };
  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, max_results: maxResults, search_depth: 'basic', include_answer: false }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!r.ok) throw new HttpError(r.status, `Tavily ${r.status}`);
  const j = await r.json();
  return { results: (j.results || []) as TavilyResult[], answer: (j.answer as string) || null };
}

export interface TavilyResult { title: string; url: string; content: string; score?: number }

export class HttpError extends Error {
  status: number;
  constructor(status: number, msg: string) { super(msg); this.status = status; }
}

/** Pull the first JSON object out of a model reply, tolerating code fences and thinking text. */
export function extractJson<T>(text: string): T {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(json)?/g, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new HttpError(502, 'Model did not return JSON');
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

export function send(res: { status: (n: number) => { json: (b: unknown) => void } }, err: unknown) {
  const status = err instanceof HttpError ? err.status : 500;
  res.status(status).json({ error: err instanceof Error ? err.message : String(err) });
}
