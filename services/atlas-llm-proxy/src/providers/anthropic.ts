/**
 * Anthropic Messages adapter. Spec 003 §providers.
 *
 * Forwards the Atlas client's request to Anthropic with the server-held
 * ANTHROPIC_API_KEY. Returns the response stream as-is so the client can
 * SSE-consume it directly. Token counts come from Anthropic's `usage`
 * block on the final message.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export interface AnthropicForwardArgs {
  apiKey: string;
  body: unknown;
  /** When true, forward the upstream stream verbatim. */
  stream: boolean;
  fetchImpl?: typeof fetch;
}

export interface AnthropicForwardResult {
  status: number;
  headers: Record<string, string>;
  body: ReadableStream | ArrayBuffer;
  /** Set after consuming a non-streamed response. Null for streams (caller is
   *  responsible for tee-ing if usage is needed mid-flight). */
  usage?: { input_tokens: number; output_tokens: number };
  rawId?: string;
}

export async function forwardAnthropic(args: AnthropicForwardArgs): Promise<AnthropicForwardResult> {
  const f = args.fetchImpl ?? fetch;
  const res = await f(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': args.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(args.body),
  });

  const passthrough: Record<string, string> = {};
  for (const k of ['content-type', 'anthropic-organization-id', 'request-id']) {
    const v = res.headers.get(k);
    if (v) passthrough[k] = v;
  }

  if (args.stream) {
    // Streaming: pass the body straight through. Token counts arrive on
    // the final `message_delta` SSE event but we don't intercept them
    // here in v0.1 (caller does post-stream accounting from buffered
    // input estimate + provider's final usage; or we add a tee adapter
    // later). For v0.1 streamed mode is best-effort metering.
    return {
      status: res.status,
      headers: passthrough,
      body: res.body!,
      rawId: passthrough['request-id'],
    };
  }

  const buf = await res.arrayBuffer();
  // Try to pull usage from the non-stream JSON body. Don't error if shape changes.
  let usage: AnthropicForwardResult['usage'];
  try {
    const text = new TextDecoder().decode(buf);
    const parsed = JSON.parse(text) as { usage?: { input_tokens?: number; output_tokens?: number } };
    if (parsed.usage) {
      usage = {
        input_tokens: parsed.usage.input_tokens ?? 0,
        output_tokens: parsed.usage.output_tokens ?? 0,
      };
    }
  } catch {
    // ignore
  }

  return {
    status: res.status,
    headers: passthrough,
    body: buf,
    usage,
    rawId: passthrough['request-id'],
  };
}
