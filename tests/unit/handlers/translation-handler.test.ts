/**
 * Unit tests for routing handler response translation wiring
 * Verifies that translateResponseApiToChatResponse is correctly wired
 * in the chat_completions→response branch of the routing handler
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
  maxConcurrentConnections: 1000
};

const validResponsesApiBody = {
  id: 'resp_abc123',
  object: 'response',
  model: 'gpt-4',
  output: [
    {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'Hello, I am the assistant.' }]
    }
  ],
  stop_reason: 'end_turn',
  usage: {
    input_tokens: 10,
    output_tokens: 8,
    total_tokens: 18
  }
};

describe('Routing handler — response translation wiring', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildServer({ config: testConfig, logger: false });
    await app.ready();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it('should translate chat request and translate response back to chat format', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValue(JSON.stringify(validResponsesApiBody))
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
    expect(body.object).toBe('chat.completion');
    expect(Array.isArray(body.choices)).toBe(true);
    expect(body.choices[0].message.content).toBe('Hello, I am the assistant.');
    expect(body.choices[0].message.role).toBe('assistant');
    expect(body.choices[0].finish_reason).toBe('stop');
  });

  it('should return 502 when upstream returns non-JSON response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: vi.fn().mockResolvedValue('<html><body>Error</body></html>')
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

    expect(response.statusCode).toBe(502);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Bad Gateway');
  });

  it('should return 502 when upstream response translation fails (empty output array)', async () => {
    const invalidResponsesApiBody = {
      id: 'resp_bad',
      object: 'response',
      model: 'gpt-4',
      output: [],
      stop_reason: 'end_turn'
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValue(JSON.stringify(invalidResponsesApiBody))
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

    expect(response.statusCode).toBe(502);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Bad Gateway');
  });

  it('should return 504 on upstream timeout (AbortError)', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      headers: { 'content-type': 'application/json' },
      payload: {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }]
      }
    });

    expect(response.statusCode).toBe(504);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Gateway Timeout');
  });
});

describe('Routing handler — response → chat_completions translation wiring', () => {
  const chatConfig: AdapterConfig = {
    targetUrl: 'https://api.openai.com',
    modelMapping: { 'gpt-3.5-turbo': 'chat_completions' },
    maxRequestSizeBytes: 10485760,
    maxJsonDepth: 100,
    upstreamTimeoutSeconds: 30,
    maxConcurrentConnections: 1000
  };

  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildServer({ config: chatConfig, logger: false });
    await app.ready();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it('should translate Responses API request and return Responses API response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValue(JSON.stringify({
        id: 'chatcmpl-abc',
        object: 'chat.completion',
        model: 'gpt-3.5-turbo',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hi there!' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }
      }))
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
    expect(Array.isArray(body.output)).toBe(true);
    expect(body.output[0].content[0].text).toBe('Hi there!');
    expect(body.stop_reason).toBe('end_turn');
    expect(body.choices).toBeUndefined();
  });

  it('should return 502 when upstream Chat Completions returns non-JSON response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: vi.fn().mockResolvedValue('<html>Error</html>')
    }));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      headers: { 'content-type': 'application/json' },
      payload: { model: 'gpt-3.5-turbo', input: 'Hello' }
    });

    expect(response.statusCode).toBe(502);
  });

  it('should return 502 when upstream Chat Completions response translation fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValue(JSON.stringify({ id: 'c1', choices: [] }))
    }));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      headers: { 'content-type': 'application/json' },
      payload: { model: 'gpt-3.5-turbo', input: 'Hello' }
    });

    expect(response.statusCode).toBe(502);
  });

  it('should return 504 on upstream timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    ));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      headers: { 'content-type': 'application/json' },
      payload: { model: 'gpt-3.5-turbo', input: 'Hello' }
    });

    expect(response.statusCode).toBe(504);
  });
});
