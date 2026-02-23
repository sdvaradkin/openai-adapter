import type { Redis } from 'ioredis';
import type { StoredTurn } from './types.js';

/**
 * Stores a single conversation turn in Redis under a TTL-bounded key.
 * Errors are caught and logged — this function never throws.
 *
 * @param redis - ioredis client instance
 * @param responseId - Unique identifier for this response (becomes part of the Redis key)
 * @param turn - The conversation turn to persist
 * @param keyPrefix - Namespace prefix for all Redis keys (e.g. 'oai-adapter:')
 * @param ttlSeconds - Time-to-live in seconds for the stored key
 */
export async function storeTurn(
  redis: Redis,
  responseId: string,
  turn: StoredTurn,
  keyPrefix: string,
  ttlSeconds: number,
): Promise<void> {
  const key = `${keyPrefix}${responseId}`;
  try {
    await redis.set(key, JSON.stringify(turn), 'EX', ttlSeconds);
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        msg: 'Failed to store conversation turn',
        responseId,
        error: String(err),
      }),
    );
  }
}

/**
 * Reconstructs a chronological messages[] array by walking the previousResponseId chain
 * stored in Redis. Uses an iterative approach to avoid call-stack overflows on deep chains.
 *
 * - Stops gracefully at broken chain links (missing keys) and returns partial history.
 * - Stops gracefully on Redis errors and returns partial history accumulated so far.
 * - Respects the maxDepth cap to avoid unbounded walks.
 *
 * @param redis - ioredis client instance
 * @param startResponseId - The most-recent response ID to begin the chain walk from
 * @param keyPrefix - Namespace prefix used when the turns were stored
 * @param maxDepth - Maximum number of turns to walk back through
 * @returns Chronological array of { role, content } messages (oldest first)
 */
export async function reconstructMessages(
  redis: Redis,
  startResponseId: string,
  keyPrefix: string,
  maxDepth: number,
): Promise<Array<{ role: string; content: string }>> {
  const turns: StoredTurn[] = [];
  let currentId: string | null = startResponseId;
  let depth = 0;

  while (currentId !== null && depth < maxDepth) {
    const key = `${keyPrefix}${currentId}`;
    let raw: string | null;

    try {
      raw = await redis.get(key);
    } catch {
      // Redis error — return whatever partial history we have accumulated so far
      break;
    }

    if (raw === null) {
      // Missing key — broken chain link, use partial history from here forward
      break;
    }

    const turn = JSON.parse(raw) as StoredTurn;
    turns.push(turn);
    currentId = turn.previousResponseId;
    depth++;
  }

  // turns is newest-first; reverse to get chronological (oldest-first) order
  turns.reverse();

  const messages: Array<{ role: string; content: string }> = [];
  for (const turn of turns) {
    messages.push({ role: 'user', content: turn.userInput });
    messages.push({ role: 'assistant', content: turn.assistantOutput });
  }

  return messages;
}
