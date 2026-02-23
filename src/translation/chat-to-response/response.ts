/**
 * Chat Completions -> Responses API response translation
 * Implements field mapping from Chat Completions response format to Responses API response format
 */

import type { ResponseApiFullResponse } from '../types.js';
import type { ChatToResponseApiTranslationResult } from './types.js';

/**
 * Map Chat Completions finish_reason to Responses API stop_reason
 *
 * - stop       -> end_turn
 * - length     -> max_tokens
 * - tool_calls -> tool_calls
 * - anything else -> end_turn (safe default)
 */
function mapFinishReason(finishReason: unknown): string {
  switch (finishReason) {
    case 'stop': return 'end_turn';
    case 'length': return 'max_tokens';
    case 'tool_calls': return 'tool_calls';
    default: return 'end_turn';
  }
}

/**
 * Translate a Chat Completions response body to Responses API response format.
 *
 * Field mappings:
 * - id -> id (direct copy, fallback to empty string)
 * - object -> always 'response'
 * - model -> model (direct copy, fallback to empty string)
 * - choices[0].message.content -> output[0].content[0].text
 * - choices[0].message.role -> output[0].role (default: 'assistant')
 * - choices[0].finish_reason -> stop_reason (via mapFinishReason)
 * - usage.prompt_tokens -> usage.input_tokens
 * - usage.completion_tokens -> usage.output_tokens
 * - usage.total_tokens -> usage.total_tokens
 * - status always 'completed'
 * - output[0].type always 'message'
 * - output[0].status always 'completed'
 * - output[0].content[0].type always 'output_text'
 * - output[0].content[0].annotations always []
 * - output[0].id synthesized as 'msg_' + id
 */
export function translateChatToResponseApiResponse(
  response: unknown
): ChatToResponseApiTranslationResult {
  try {
    if (typeof response !== 'object' || response === null) {
      return { success: false, error: 'Response must be a valid object' };
    }

    const chatResp = response as Record<string, unknown>;

    if (!Array.isArray(chatResp['choices']) || chatResp['choices'].length === 0) {
      return { success: false, error: 'Response choices array is missing or empty' };
    }

    const firstChoice = chatResp['choices'][0] as Record<string, unknown>;
    const message = (firstChoice['message'] ?? {}) as Record<string, unknown>;

    if (typeof message['content'] !== 'string') {
      return { success: false, error: 'Response contains no extractable text content' };
    }

    const content = message['content'];
    const role = typeof message['role'] === 'string' ? message['role'] : 'assistant';
    const id = typeof chatResp['id'] === 'string' ? chatResp['id'] : '';
    const model = typeof chatResp['model'] === 'string' ? chatResp['model'] : '';

    const translated: ResponseApiFullResponse = {
      id,
      object: 'response',
      model,
      output: [
        {
          id: `msg_${id}`,
          type: 'message',
          role,
          status: 'completed',
          content: [
            {
              type: 'output_text',
              text: content,
              annotations: []
            }
          ]
        }
      ],
      stop_reason: mapFinishReason(firstChoice['finish_reason']),
      status: 'completed'
    };

    if (typeof chatResp['usage'] === 'object' && chatResp['usage'] !== null) {
      const u = chatResp['usage'] as Record<string, unknown>;
      translated.usage = {
        input_tokens: typeof u['prompt_tokens'] === 'number' ? u['prompt_tokens'] : 0,
        output_tokens: typeof u['completion_tokens'] === 'number' ? u['completion_tokens'] : 0,
        total_tokens: typeof u['total_tokens'] === 'number' ? u['total_tokens'] : 0
      };
    }

    return { success: true, translated };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
