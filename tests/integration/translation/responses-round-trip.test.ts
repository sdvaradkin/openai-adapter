/**
 * Integration test: Responses API → Chat Completions → Responses API round-trip
 * Proves the full flow works end-to-end with a mocked upstream.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../../src/index.js';
import type { AdapterConfig } from '../../../src/config/types.js';

const testConfig: AdapterConfig = {
  targetUrl: 'https://api.openai.com',
  modelMapping: { 'gpt-3.5-turbo': 'chat_completions' },
  maxRequestSizeBytes: 10485760,
  maxJsonDepth: 100,
  upstreamTimeoutSeconds: 30,
  maxConcurrentConnections: 1000
};

function makeChatCompletionsBody(text = 'Hi there!'): Record<string, unknown> {
  return {
    id: 'chatcmpl-xyz789',
    object: 'chat.completion',
    model: 'gpt-3.5-turbo',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: 'stop'
      }
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
  };
}

describe('Responses API → Chat Completions → Responses API round-trip (mocked upstream)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildServer({ config: testConfig, logger: false });
    await app.ready();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it('happy path: Responses API client gets Responses API response from chat_completions-format model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValue(JSON.stringify(makeChatCompletionsBody()))
    }));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      headers: { 'content-type': 'application/json' },
      payload: { model: 'gpt-3.5-turbo', input: 'Hello' }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.object).toBe('response');
    expect(body.status).toBe('completed');
    expect(Array.isArray(body.output)).toBe(true);
    expect(body.output[0].type).toBe('message');
    expect(body.output[0].status).toBe('completed');
    expect(body.output[0].content[0].text).toBe('Hi there!');
    expect(body.output[0].role).toBe('assistant');
    expect(body.stop_reason).toBe('end_turn');
    expect(body.choices).toBeUndefined(); // Must NOT have Chat Completions fields
  });

  it('request translation: upstream Chat Completions receives translated request body (messages, not input)', async () => {
    let capturedBody: Record<string, unknown> | null = null;

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: vi.fn().mockResolvedValue(JSON.stringify(makeChatCompletionsBody()))
      };
    }));

    await app.inject({
      method: 'POST',
      url: '/v1/responses',
      headers: { 'content-type': 'application/json' },
      payload: { model: 'gpt-3.5-turbo', input: 'Tell me a joke' }
    });

    expect(capturedBody).not.toBeNull();
    expect(Array.isArray(capturedBody!['messages'])).toBe(true);
    expect(capturedBody!['input']).toBeUndefined(); // Must NOT have Responses API fields
    expect(capturedBody!['model']).toBe('gpt-3.5-turbo');
    const messages = capturedBody!['messages'] as Array<{ role: string; content: string }>;
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('Tell me a joke');
  });

  it('instructions mapping: instructions become a system message in the upstream Chat Completions request', async () => {
    let capturedBody: Record<string, unknown> | null = null;

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: vi.fn().mockResolvedValue(JSON.stringify(makeChatCompletionsBody()))
      };
    }));

    await app.inject({
      method: 'POST',
      url: '/v1/responses',
      headers: { 'content-type': 'application/json' },
      payload: { model: 'gpt-3.5-turbo', input: 'Hello', instructions: 'You are a helpful assistant.' }
    });

    expect(capturedBody).not.toBeNull();
    const messages = capturedBody!['messages'] as Array<{ role: string; content: string }>;
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toBe('You are a helpful assistant.');
    expect(messages[1].role).toBe('user');
  });

  it('dropped fields: previous_response_id is not forwarded to upstream', async () => {
    let capturedBody: Record<string, unknown> | null = null;

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: vi.fn().mockResolvedValue(JSON.stringify(makeChatCompletionsBody()))
      };
    }));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      headers: { 'content-type': 'application/json' },
      payload: { model: 'gpt-3.5-turbo', input: 'Hello', previous_response_id: 'resp_old_123' }
    });

    // Request must not fail (TRANS-03: drop, don't fail)
    expect(response.statusCode).toBe(200);
    expect(capturedBody).not.toBeNull();
    expect(capturedBody!['previous_response_id']).toBeUndefined();
  });

  it('field mapping: max_output_tokens is translated to max_tokens in upstream request', async () => {
    let capturedBody: Record<string, unknown> | null = null;

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: vi.fn().mockResolvedValue(JSON.stringify(makeChatCompletionsBody()))
      };
    }));

    await app.inject({
      method: 'POST',
      url: '/v1/responses',
      headers: { 'content-type': 'application/json' },
      payload: { model: 'gpt-3.5-turbo', input: 'Hi', max_output_tokens: 150 }
    });

    expect(capturedBody).not.toBeNull();
    expect(capturedBody!['max_tokens']).toBe(150);
    expect(capturedBody!['max_output_tokens']).toBeUndefined();
  });

  it('usage mapping: upstream usage fields are correctly renamed in the Responses API response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValue(JSON.stringify(makeChatCompletionsBody()))
    }));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      headers: { 'content-type': 'application/json' },
      payload: { model: 'gpt-3.5-turbo', input: 'Hello' }
    });

    const body = JSON.parse(response.body);
    expect(body.usage.input_tokens).toBe(10);
    expect(body.usage.output_tokens).toBe(5);
    expect(body.usage.total_tokens).toBe(15);
    expect(body.usage.prompt_tokens).toBeUndefined();
    expect(body.usage.completion_tokens).toBeUndefined();
  });
});
