import type { JevAnswer, JevQuestions, JevResponse, JevState } from './types.js';

export const SYSTEM_ONE_URL = 'https://api.typesafe.ai/v1/systemone';
export const DEFAULT_MODEL = 'jev-latest';

export interface JevRequest {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
}

/** The HTTP request for one Jev call, for any fetch-like transport. */
export function buildJevRequest(
  params: {
    apiKey: string;
    model?: string;
    baseUrl?: string;
  },
  state: JevState,
  questions: JevQuestions,
): JevRequest {
  const headers = {
    authorization: `Bearer ${params.apiKey}`,
    'content-type': 'application/json',
  };
  const model = params.model ?? DEFAULT_MODEL;
  // Router mode (Requesty): a `/v1` base speaks chat completions, questions ride in response_format.
  if (params.baseUrl && /\/v1\/?$/.test(params.baseUrl)) {
    return {
      url: `${params.baseUrl.replace(/\/$/, '')}/chat/completions`,
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: typeof state === 'string' ? state : JSON.stringify(state) }],
        response_format: { type: 'questions', questions },
      }),
    };
  }
  return {
    url: params.baseUrl ?? SYSTEM_ONE_URL,
    method: 'POST',
    headers,
    body: JSON.stringify({ model, state, questions }),
  };
}

/** Validates a Jev response body; throws on anything but an `answers` object. */
export function parseJevResponse(
  status: number,
  ok: boolean,
  text: string,
): JevResponse {
  if (!ok) {
    throw new Error(`Jev request failed (${status}): ${text.slice(0, 200)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Jev returned malformed JSON');
  }
  // Router mode: answers arrive as a JSON string in choices[0].message.content.
  const content = (parsed as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]
    ?.message?.content;
  if (typeof content === 'string') {
    try {
      parsed = { answers: JSON.parse(content) };
    } catch {
      throw new Error('Jev returned malformed JSON');
    }
  }
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    !('answers' in parsed) ||
    parsed.answers === null ||
    typeof parsed.answers !== 'object'
  ) {
    throw new Error('Jev response is missing answers');
  }
  return parsed as JevResponse;
}

/** The `noul` probability of one answer; throws when it is not there. */
export function noulAnswer(
  answers: Record<string, JevAnswer>,
  name: string,
): number {
  const answer = answers[name];
  if (
    !answer ||
    !('noul' in answer) ||
    typeof answer.noul !== 'number' ||
    !Number.isFinite(answer.noul)
  ) {
    throw new Error(`Invalid Jev answer for ${name}`);
  }
  return answer.noul;
}
