/**
 * Spec 040 v0.2 — provider adapters for web search / scrape.
 *
 * One function per provider. Each takes the decrypted api key + the
 * call args, hits the upstream, and normalises the response into
 * { results, raw_status, cost_usd, input_size, output_size }.
 *
 * Cost map below is the *unit* cost per call as published 2026-06-02.
 * Refresh quarterly. Numbers fed into tool_usage_events.cost_usd so the
 * admin's per-org / per-user rollups stay accurate.
 */

export interface AdapterResult {
  results: unknown;          // adapter-shaped; agent receives this as-is
  status: 'ok' | 'upstream_error';
  cost_usd: number;
  input_size: number;        // bytes
  output_size: number;       // bytes
  upstream_error?: string;
}

const PRICING: Record<string, { search?: number; scrape?: number }> = {
  brave:     { search: 0.003 },           // $3 / 1k searches (free tier 2k/mo)
  tavily:    { search: 0.008 },           // ~$8 / 1k searches
  serper:    { search: 0.001 },           // ~$1 / 1k searches
  firecrawl: { scrape: 0.001 },           // ~$1 / 1k scrapes (single page)
  custom_http: { search: 0, scrape: 0 },  // unknown — admin must override
};

function costFor(provider: string, op: 'search' | 'scrape'): number {
  return PRICING[provider]?.[op] ?? 0;
}

// -------------------- Brave Search ---------------------------------------
export async function searchBrave(
  apiKey: string,
  query: string,
  count: number
): Promise<AdapterResult> {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(Math.max(1, Math.min(20, count))));
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': apiKey,
    },
  });
  const body = await res.text();
  if (!res.ok) {
    return {
      results: null,
      status: 'upstream_error',
      cost_usd: 0,
      input_size: query.length,
      output_size: body.length,
      upstream_error: `brave ${res.status}: ${body.slice(0, 200)}`,
    };
  }
  const json = JSON.parse(body) as {
    web?: { results?: Array<{ title: string; url: string; description?: string }> };
  };
  const results = (json.web?.results ?? []).map((r) => ({
    title: r.title, url: r.url, snippet: r.description ?? '',
  }));
  return {
    results,
    status: 'ok',
    cost_usd: costFor('brave', 'search'),
    input_size: query.length,
    output_size: body.length,
  };
}

// -------------------- Tavily ---------------------------------------------
export async function searchTavily(
  apiKey: string,
  query: string,
  count: number
): Promise<AdapterResult> {
  const payload = JSON.stringify({
    api_key: apiKey,
    query,
    max_results: Math.max(1, Math.min(20, count)),
    search_depth: 'basic',
  });
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });
  const body = await res.text();
  if (!res.ok) {
    return {
      results: null, status: 'upstream_error', cost_usd: 0,
      input_size: payload.length, output_size: body.length,
      upstream_error: `tavily ${res.status}: ${body.slice(0, 200)}`,
    };
  }
  const json = JSON.parse(body) as {
    results?: Array<{ title: string; url: string; content?: string; score?: number }>;
  };
  const results = (json.results ?? []).map((r) => ({
    title: r.title, url: r.url, snippet: r.content ?? '', score: r.score,
  }));
  return {
    results, status: 'ok', cost_usd: costFor('tavily', 'search'),
    input_size: payload.length, output_size: body.length,
  };
}

// -------------------- Serper.dev (Google SERP) ---------------------------
export async function searchSerper(
  apiKey: string,
  query: string,
  count: number
): Promise<AdapterResult> {
  const payload = JSON.stringify({ q: query, num: Math.max(1, Math.min(20, count)) });
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
    body: payload,
  });
  const body = await res.text();
  if (!res.ok) {
    return {
      results: null, status: 'upstream_error', cost_usd: 0,
      input_size: payload.length, output_size: body.length,
      upstream_error: `serper ${res.status}: ${body.slice(0, 200)}`,
    };
  }
  const json = JSON.parse(body) as {
    organic?: Array<{ title: string; link: string; snippet?: string }>;
  };
  const results = (json.organic ?? []).map((r) => ({
    title: r.title, url: r.link, snippet: r.snippet ?? '',
  }));
  return {
    results, status: 'ok', cost_usd: costFor('serper', 'search'),
    input_size: payload.length, output_size: body.length,
  };
}

// -------------------- Firecrawl (scrape) ---------------------------------
export async function scrapeFirecrawl(
  apiKey: string,
  url: string
): Promise<AdapterResult> {
  const payload = JSON.stringify({
    url,
    formats: ['markdown'],
    onlyMainContent: true,
  });
  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: payload,
  });
  const body = await res.text();
  if (!res.ok) {
    return {
      results: null, status: 'upstream_error', cost_usd: 0,
      input_size: url.length, output_size: body.length,
      upstream_error: `firecrawl ${res.status}: ${body.slice(0, 200)}`,
    };
  }
  const json = JSON.parse(body) as {
    data?: { markdown?: string; metadata?: { title?: string; description?: string } };
  };
  return {
    results: {
      url,
      title: json.data?.metadata?.title ?? '',
      description: json.data?.metadata?.description ?? '',
      markdown: json.data?.markdown ?? '',
    },
    status: 'ok',
    cost_usd: costFor('firecrawl', 'scrape'),
    input_size: url.length,
    output_size: body.length,
  };
}

// -------------------- custom_http ---------------------------------------
// Generic adapter for the admin's "bring-your-own endpoint" option.
// Posts the query/url + sends the api key per the provider row's auth_scheme.
export async function callCustomHttp(
  opts: {
    apiKey: string;
    baseUrl: string;
    authScheme: string;
    op: 'search' | 'scrape';
    query?: string;
    url?: string;
    count?: number;
  }
): Promise<AdapterResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  switch (opts.authScheme) {
    case 'bearer': headers['Authorization'] = `Bearer ${opts.apiKey}`; break;
    case 'x-api-key': headers['X-API-Key'] = opts.apiKey; break;
    case 'x-subscription-token': headers['X-Subscription-Token'] = opts.apiKey; break;
    case 'query-param': /* appended below */ break;
    default: headers['X-API-Key'] = opts.apiKey;
  }
  const body = JSON.stringify(opts.op === 'search'
    ? { query: opts.query, count: opts.count }
    : { url: opts.url });
  const target = opts.authScheme === 'query-param'
    ? `${opts.baseUrl}?key=${encodeURIComponent(opts.apiKey)}`
    : opts.baseUrl;
  const res = await fetch(target, { method: 'POST', headers, body });
  const text = await res.text();
  if (!res.ok) {
    return {
      results: null, status: 'upstream_error', cost_usd: 0,
      input_size: body.length, output_size: text.length,
      upstream_error: `custom_http ${res.status}: ${text.slice(0, 200)}`,
    };
  }
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* leave as text */ }
  return {
    results: parsed,
    status: 'ok',
    cost_usd: costFor('custom_http', opts.op),
    input_size: body.length,
    output_size: text.length,
  };
}
