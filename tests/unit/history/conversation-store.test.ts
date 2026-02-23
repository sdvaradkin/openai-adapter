/**
 * Unit tests for conversation store — storeTurn and reconstructMessages
 * Uses a mock Redis object to avoid any real Redis dependency.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Redis } from 'ioredis';
import { storeTurn, reconstructMessages } from '../../../src/history/conversation-store.js';
import type { StoredTurn } from '../../../src/history/types.js';

const PREFIX = 'test:';
const TTL = 86400;

/**
 * Creates a mock Redis client backed by an in-memory Map.
 * The mock's get/set methods are vitest spies so call assertions work.
 */
function createMockRedis(store: Map<string, string> = new Map()) {
  return {
    set: vi.fn(async (key: string, value: string, _ex: string, _ttl: number) => {
      store.set(key, value);
      return 'OK';
    }),
    get: vi.fn(async (key: string) => {
      return store.get(key) ?? null;
    }),
  } as unknown as Redis;
}

// ---------------------------------------------------------------------------
// storeTurn tests
// ---------------------------------------------------------------------------

describe('storeTurn', () => {
  let store: Map<string, string>;
  let redis: Redis;

  beforeEach(() => {
    store = new Map();
    redis = createMockRedis(store);
  });

  it('stores turn with correct key prefix and JSON value', async () => {
    const turn: StoredTurn = {
      userInput: 'Hello',
      assistantOutput: 'Hi there!',
      previousResponseId: null,
    };

    await storeTurn(redis, 'resp-001', turn, PREFIX, TTL);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockSet = redis.set as any;
    expect(mockSet).toHaveBeenCalledOnce();
    expect(mockSet.mock.calls[0][0]).toBe(`${PREFIX}resp-001`);
    expect(mockSet.mock.calls[0][1]).toBe(JSON.stringify(turn));
    expect(mockSet.mock.calls[0][2]).toBe('EX');
  });

  it('stores turn with 24h TTL', async () => {
    const turn: StoredTurn = {
      userInput: 'What time is it?',
      assistantOutput: 'It is noon.',
      previousResponseId: null,
    };

    await storeTurn(redis, 'resp-002', turn, PREFIX, 86400);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockSet = redis.set as any;
    expect(mockSet.mock.calls[0][3]).toBe(86400);
  });

  it('does not throw when Redis set fails', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (redis.set as any).mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const turn: StoredTurn = {
      userInput: 'test',
      assistantOutput: 'test response',
      previousResponseId: null,
    };

    // Should resolve without throwing
    await expect(storeTurn(redis, 'resp-003', turn, PREFIX, TTL)).resolves.toBeUndefined();
  });

  it('logs warning when Redis set fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (redis.set as any).mockRejectedValueOnce(new Error('Redis down'));

    const turn: StoredTurn = {
      userInput: 'test',
      assistantOutput: 'test response',
      previousResponseId: null,
    };

    await storeTurn(redis, 'resp-004', turn, PREFIX, TTL);

    expect(warnSpy).toHaveBeenCalledOnce();
    const loggedArg = warnSpy.mock.calls[0][0] as string;
    expect(loggedArg).toContain('Failed to store');
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// reconstructMessages tests
// ---------------------------------------------------------------------------

describe('reconstructMessages', () => {
  let store: Map<string, string>;
  let redis: Redis;

  beforeEach(() => {
    store = new Map();
    redis = createMockRedis(store);
  });

  it('returns empty array when startResponseId not found', async () => {
    const messages = await reconstructMessages(redis, 'missing-id', PREFIX, 75);

    expect(messages).toEqual([]);
  });

  it('reconstructs single-turn history', async () => {
    const turn: StoredTurn = {
      userInput: 'What is 2+2?',
      assistantOutput: 'It is 4.',
      previousResponseId: null,
    };
    store.set(`${PREFIX}resp-a`, JSON.stringify(turn));

    const messages = await reconstructMessages(redis, 'resp-a', PREFIX, 75);

    expect(messages).toEqual([
      { role: 'user', content: 'What is 2+2?' },
      { role: 'assistant', content: 'It is 4.' },
    ]);
  });

  it('reconstructs multi-turn history in chronological order', async () => {
    // Chain: resp-c → resp-b → resp-a (oldest)
    const turnA: StoredTurn = {
      userInput: 'First question',
      assistantOutput: 'First answer',
      previousResponseId: null,
    };
    const turnB: StoredTurn = {
      userInput: 'Second question',
      assistantOutput: 'Second answer',
      previousResponseId: 'resp-a',
    };
    const turnC: StoredTurn = {
      userInput: 'Third question',
      assistantOutput: 'Third answer',
      previousResponseId: 'resp-b',
    };
    store.set(`${PREFIX}resp-a`, JSON.stringify(turnA));
    store.set(`${PREFIX}resp-b`, JSON.stringify(turnB));
    store.set(`${PREFIX}resp-c`, JSON.stringify(turnC));

    const messages = await reconstructMessages(redis, 'resp-c', PREFIX, 75);

    // Chronological order: A, B, C — 6 messages total
    expect(messages).toHaveLength(6);
    expect(messages[0]).toEqual({ role: 'user', content: 'First question' });
    expect(messages[1]).toEqual({ role: 'assistant', content: 'First answer' });
    expect(messages[2]).toEqual({ role: 'user', content: 'Second question' });
    expect(messages[3]).toEqual({ role: 'assistant', content: 'Second answer' });
    expect(messages[4]).toEqual({ role: 'user', content: 'Third question' });
    expect(messages[5]).toEqual({ role: 'assistant', content: 'Third answer' });
  });

  it('stops at broken chain (missing intermediate turn)', async () => {
    // Chain: resp-c → resp-b (missing) — only resp-c and resp-a exist
    const turnA: StoredTurn = {
      userInput: 'Turn A question',
      assistantOutput: 'Turn A answer',
      previousResponseId: null,
    };
    const turnC: StoredTurn = {
      userInput: 'Turn C question',
      assistantOutput: 'Turn C answer',
      previousResponseId: 'resp-b', // resp-b does NOT exist in store
    };
    store.set(`${PREFIX}resp-a`, JSON.stringify(turnA));
    store.set(`${PREFIX}resp-c`, JSON.stringify(turnC));

    const messages = await reconstructMessages(redis, 'resp-c', PREFIX, 75);

    // Should only return turn C (chain broken at resp-b, partial history from break point forward)
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ role: 'user', content: 'Turn C question' });
    expect(messages[1]).toEqual({ role: 'assistant', content: 'Turn C answer' });
  });

  it('respects maxDepth cap', async () => {
    // Store 5 chained turns
    const turns: StoredTurn[] = [];
    for (let i = 0; i < 5; i++) {
      turns.push({
        userInput: `Question ${i + 1}`,
        assistantOutput: `Answer ${i + 1}`,
        previousResponseId: i > 0 ? `resp-${i - 1}` : null,
      });
    }
    for (let i = 0; i < 5; i++) {
      store.set(`${PREFIX}resp-${i}`, JSON.stringify(turns[i]));
    }

    // Walk from resp-4 (newest) with maxDepth=3 — should only get 3 turns (6 messages)
    const messages = await reconstructMessages(redis, 'resp-4', PREFIX, 3);

    expect(messages).toHaveLength(6);
    // The 3 most recent turns: resp-4, resp-3, resp-2 — reversed to chronological
    expect(messages[0]).toEqual({ role: 'user', content: 'Question 3' });
    expect(messages[1]).toEqual({ role: 'assistant', content: 'Answer 3' });
    expect(messages[2]).toEqual({ role: 'user', content: 'Question 4' });
    expect(messages[3]).toEqual({ role: 'assistant', content: 'Answer 4' });
    expect(messages[4]).toEqual({ role: 'user', content: 'Question 5' });
    expect(messages[5]).toEqual({ role: 'assistant', content: 'Answer 5' });
  });

  it('returns empty array when Redis get throws', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (redis.get as any).mockRejectedValueOnce(new Error('Connection timeout'));

    const messages = await reconstructMessages(redis, 'resp-x', PREFIX, 75);

    expect(messages).toEqual([]);
  });

  it('handles turn with null previousResponseId (chain root)', async () => {
    const rootTurn: StoredTurn = {
      userInput: 'Root question',
      assistantOutput: 'Root answer',
      previousResponseId: null,
    };
    store.set(`${PREFIX}resp-root`, JSON.stringify(rootTurn));

    const messages = await reconstructMessages(redis, 'resp-root', PREFIX, 75);

    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ role: 'user', content: 'Root question' });
    expect(messages[1]).toEqual({ role: 'assistant', content: 'Root answer' });
  });
});
