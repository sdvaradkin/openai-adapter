/**
 * Integration test: Chat Completions → Responses API → Chat Completions round-trip
 *
 * Closes UAT gap (test 4): proves that a Chat Completions client sending a request
 * to a response-format model receives a proper Chat Completions response.
 *
 * The upstream fetch is mocked so no live API key is needed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildServer } from '../../../src/index.js';
import type { FastifyInstance } from 'fastify';
import type { AdapterConfig } from '../../../src/config/types.js';

const testConfig: AdapterConfig = {
  targetUrl: 'https://api.openai.com',
  modelMapping: { 'gpt-4': 'response' },
  maxRequestSizeBytes: 10485760,
  maxJsonDepth: 100,
  upstreamTimeoutSeconds: 30,
  maxConcurrentConnections: 1000,
  modelMappingFile: '/dev/null',
  redisUrl: 'redis://localhost:6379',
  redisKeyPrefix: 'oai-adapter:',
  conversationTtlSeconds: 86400,
  conversationMaxDepth: 75,
};

/**
 * Build a mock Responses API response body
 */
function makeResponsesApiBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 'resp_1',
    object: 'response',
    model: 'gpt-4',
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Hi there!' }]
      }
    ],
    stop_reason: 'end_turn',
    ...overrides
  };
}

describe('Chat → Responses API → Chat round-trip (mocked upstream)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildServer({ config: testConfig, logger: false });
    await app.ready();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it('happy path: Chat Completions client gets Chat Completions response from response-format model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValue(JSON.stringify(makeResponsesApiBody()))
    }));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      headers: { 'content-type': 'application/json' },
      payload: {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }]
      }
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);

    // Response must be in Chat Completions format
    expect(body.object).toBe('chat.completion');
    expect(Array.isArray(body.choices)).toBe(true);
    expect(body.choices).toHaveLength(1);

    // choices[0] assertions
    expect(body.choices[0].message.content).toBe('Hi there!');
    expect(body.choices[0].message.role).toBe('assistant');
    expect(body.choices[0].finish_reason).toBe('stop');

    // Must NOT have Responses API fields
    expect(body.output).toBeUndefined();
  });

  it('request translation: upstream receives Responses API format payload', async () => {
    let capturedBody: Record<string, unknown> | null = null;

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: vi.fn().mockResolvedValue(JSON.stringify(makeResponsesApiBody()))
      };
    }));

    await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      headers: { 'content-type': 'application/json' },
      payload: {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }]
      }
    });

    // Upstream must receive Responses API format
    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.input).toBeDefined();
    expect(capturedBody!.messages).toBeUndefined();
    expect(capturedBody!.model).toBe('gpt-4');
  });

  it('multi-field mapping: temperature and max_tokens translated in request', async () => {
    let capturedBody: Record<string, unknown> | null = null;

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: vi.fn().mockResolvedValue(JSON.stringify(makeResponsesApiBody()))
      };
    }));

    await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      headers: { 'content-type': 'application/json' },
      payload: {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.5,
        max_tokens: 100
      }
    });

    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.temperature).toBe(0.5);
    expect(capturedBody!.max_output_tokens).toBe(100);
    // Original Chat Completions field must not be present
    expect(capturedBody!.max_tokens).toBeUndefined();
  });

  it('response with usage: usage fields mapped correctly', async () => {
    const responseWithUsage = makeResponsesApiBody({
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        total_tokens: 15
      }
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValue(JSON.stringify(responseWithUsage))
    }));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      headers: { 'content-type': 'application/json' },
      payload: {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Count tokens' }]
      }
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.usage).toBeDefined();
    expect(body.usage.prompt_tokens).toBe(10);
    expect(body.usage.completion_tokens).toBe(5);
    expect(body.usage.total_tokens).toBe(15);
  });
});
