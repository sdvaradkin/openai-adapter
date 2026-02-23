/**
 * Integration tests: Conversation History with real Redis via testcontainers
 * Proves end-to-end multi-turn conversation history works with real Redis persistence.
 *
 * Requirements: HIST-01, HIST-02, HIST-03
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { Redis } from 'ioredis';
import { buildServer } from '../../../src/index.js';
import type { AdapterConfig } from '../../../src/config/types.js';
import type { StoredTurn } from '../../../src/history/types.js';

// -------------------------------------------------------------------
// Testcontainers setup — real Redis instance for all tests in this file
// -------------------------------------------------------------------

let redisContainer: StartedRedisContainer;
let redisUrl: string;

beforeAll(async () => {
  redisContainer = await new RedisContainer('redis:7-alpine').start();
  redisUrl = redisContainer.getConnectionUrl();
}, 60_000);

afterAll(async () => {
  await redisContainer?.stop();
});

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function makeTestConfig(overrides: Partial<AdapterConfig> = {}): AdapterConfig {
  return {
    targetUrl: 'http://localhost:9999', // mocked via fetch stub
    modelMapping: { 'gpt-3.5-turbo': 'chat_completions' },
    maxRequestSizeBytes: 10485760,
    maxJsonDepth: 100,
    upstreamTimeoutSeconds: 30,
    maxConcurrentConnections: 1000,
    modelMappingFile: '/dev/null',
    redisUrl,
    redisKeyPrefix: 'test:hist:',
    conversationTtlSeconds: 86400,
    conversationMaxDepth: 75,
    ...overrides,
  };
}

function makeChatCompletionsResponse(id: string, text: string): string {
  return JSON.stringify({
    id,
    object: 'chat.completion',
    model: 'gpt-3.5-turbo',
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
  });
}

// -------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------

describe('Conversation History — real Redis via testcontainers', () => {
  let app: FastifyInstance;
  // A standard Redis client for test verification (no lazyConnect, no disabled queue)
  let verifyClient: Redis;
  // The Redis client passed into the server (standard connection for integration tests)
  let serverRedis: Redis;

  beforeEach(async () => {
    // Use standard (eagerly connecting) Redis clients for integration tests
    // createRedisClient uses lazyConnect+enableOfflineQueue:false for production resilience,
    // but integration tests need reliable connections from the start
    serverRedis = new Redis(redisUrl);
    verifyClient = new Redis(redisUrl);
    await serverRedis.ping(); // Ensure connection is established before tests run

    const config = makeTestConfig();
    app = buildServer({ config, redis: serverRedis, logger: false });
    await app.ready();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
    // Flush all keys after each test to ensure isolation
    await verifyClient.flushdb();
    await verifyClient.quit();
    await serverRedis.quit();
  });

  it('HIST-01: stores response turn in Redis after Responses API → Chat Completions round-trip', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValue(makeChatCompletionsResponse('chatcmpl-resp-integ-001', 'The answer is 42'))
    }));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      headers: { 'content-type': 'application/json' },
      payload: { model: 'gpt-3.5-turbo', input: 'What is the meaning of life?' }
    });

    expect(response.statusCode).toBe(200);

    // Get the response ID from the adapter's Responses API output
    const respBody = JSON.parse(response.body) as Record<string, unknown>;
    const storedResponseId = respBody['id'] as string;
    expect(typeof storedResponseId).toBe('string');
    expect(storedResponseId.length).toBeGreaterThan(0);

    // Verify the turn exists in Redis using a direct client read
    const key = `test:hist:${storedResponseId}`;
    const raw = await verifyClient.get(key);
    expect(raw).not.toBeNull();

    const turn = JSON.parse(raw!) as StoredTurn;
    expect(turn.userInput).toBe('What is the meaning of life?');
    expect(turn.assistantOutput).toBe('The answer is 42');
    expect(turn.previousResponseId).toBeNull();
  });

  it('HIST-02: reconstructs history for multi-turn conversation', async () => {
    const capturedBodies: Array<Record<string, unknown>> = [];

    // Turn 1: initial request
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBodies.push(JSON.parse(init.body as string) as Record<string, unknown>);
      return {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: vi.fn().mockResolvedValue(makeChatCompletionsResponse(`chatcmpl-turn1-${Date.now()}`, 'Turn 1 answer'))
      };
    }));

    const turn1Response = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      headers: { 'content-type': 'application/json' },
      payload: { model: 'gpt-3.5-turbo', input: 'First question' }
    });

    expect(turn1Response.statusCode).toBe(200);
    const turn1Body = JSON.parse(turn1Response.body) as Record<string, unknown>;
    const turn1Id = turn1Body['id'] as string;
    expect(typeof turn1Id).toBe('string');

    // Turn 2: with previous_response_id pointing to turn 1
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBodies.push(JSON.parse(init.body as string) as Record<string, unknown>);
      return {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: vi.fn().mockResolvedValue(makeChatCompletionsResponse(`chatcmpl-turn2-${Date.now()}`, 'Turn 2 answer'))
      };
    }));

    const turn2Response = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      headers: { 'content-type': 'application/json' },
      payload: {
        model: 'gpt-3.5-turbo',
        input: 'Second question',
        previous_response_id: turn1Id
      }
    });

    expect(turn2Response.statusCode).toBe(200);
    expect(capturedBodies).toHaveLength(2);

    // Verify Turn 2's upstream request body contains prior turn messages prepended
    const turn2UpstreamMessages = capturedBodies[1]['messages'] as Array<{ role: string; content: string }>;
    expect(turn2UpstreamMessages.length).toBe(3); // prior user + prior assistant + current user

    expect(turn2UpstreamMessages[0].role).toBe('user');
    expect(turn2UpstreamMessages[0].content).toBe('First question');
    expect(turn2UpstreamMessages[1].role).toBe('assistant');
    expect(turn2UpstreamMessages[1].content).toBe('Turn 1 answer');
    expect(turn2UpstreamMessages[2].role).toBe('user');
    expect(turn2UpstreamMessages[2].content).toBe('Second question');
  });

  it('HIST-02 edge case: treats missing previous_response_id as new conversation', async () => {
    let capturedBody: Record<string, unknown> | null = null;

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: vi.fn().mockResolvedValue(makeChatCompletionsResponse('chatcmpl-fresh', 'Fresh response'))
      };
    }));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      headers: { 'content-type': 'application/json' },
      payload: {
        model: 'gpt-3.5-turbo',
        input: 'Hello fresh',
        previous_response_id: 'resp-nonexistent-key-xyz'
      }
    });

    // Must succeed — missing history treated as new conversation
    expect(response.statusCode).toBe(200);
    expect(capturedBody).not.toBeNull();

    // Upstream receives only the current turn message (no prior messages prepended)
    const messages = capturedBody!['messages'] as Array<{ role: string; content: string }>;
    expect(messages.length).toBe(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('Hello fresh');
  });

  it('HIST-03: history survives Redis data persistence (simulates adapter restart)', async () => {
    // Send a request through the adapter — stores turn in Redis
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValue(makeChatCompletionsResponse('chatcmpl-persist-001', 'Persistent answer'))
    }));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      headers: { 'content-type': 'application/json' },
      payload: { model: 'gpt-3.5-turbo', input: 'Persist this question' }
    });

    expect(response.statusCode).toBe(200);
    const respBody = JSON.parse(response.body) as Record<string, unknown>;
    const storedId = respBody['id'] as string;

    // Create a NEW ioredis client to the same container — simulates adapter restart (new connection)
    const newClient = new Redis(redisUrl);
    try {
      const key = `test:hist:${storedId}`;
      const raw = await newClient.get(key);

      // Data must be readable from the new connection — proves external Redis persistence
      expect(raw).not.toBeNull();
      const turn = JSON.parse(raw!) as StoredTurn;
      expect(turn.userInput).toBe('Persist this question');
      expect(turn.assistantOutput).toBe('Persistent answer');
    } finally {
      await newClient.quit();
    }
  });

  it('HIST-01/HIST-03: stored turns have TTL set (approximately 24h)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValue(makeChatCompletionsResponse('chatcmpl-ttl-001', 'TTL test answer'))
    }));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      headers: { 'content-type': 'application/json' },
      payload: { model: 'gpt-3.5-turbo', input: 'TTL test question' }
    });

    expect(response.statusCode).toBe(200);
    const respBody = JSON.parse(response.body) as Record<string, unknown>;
    const storedId = respBody['id'] as string;

    // Verify TTL is set and approximately 86400 seconds (24h)
    const key = `test:hist:${storedId}`;
    const ttl = await verifyClient.ttl(key);
    expect(ttl).toBeGreaterThan(0); // TTL must be positive (key has expiry)
    expect(ttl).toBeLessThanOrEqual(86400); // Must not exceed configured TTL
    expect(ttl).toBeGreaterThan(86390); // Must be close to 86400 (within 10 seconds of setting)
  });
});
