/**
 * Response API → Chat Completions response translation
 * Implements field mapping from Response API format to Chat Completions format
 */

import type {
  ResponseApiResponse,
  ChatCompletionsResponse,
  ResponseToChatTranslationResult
} from './types.js';

/**
 * Map Responses API stop_reason to Chat Completions finish_reason
 *
 * Mappings:
 * - end_turn  → stop
 * - max_tokens → length
 * - tool_calls → tool_calls
 * - anything else → stop (safe default)
 */
function mapStopReason(stopReason: string | undefined): string {
  switch (stopReason) {
    case 'end_turn':
      return 'stop';
    case 'max_tokens':
      return 'length';
    case 'tool_calls':
      return 'tool_calls';
    default:
      return 'stop';
  }
}

/**
 * Extract the text content from the first message output item
 */
function extractOutputText(output: ResponseApiResponse['output']): string | null {
  if (!Array.isArray(output) || output.length === 0) {
    return null;
  }

  const firstItem = output[0];
  if (!firstItem || !Array.isArray(firstItem.content) || firstItem.content.length === 0) {
    return null;
  }

  // Find the first output_text content part
  for (const part of firstItem.content) {
    if (part.type === 'output_text' && typeof part.text === 'string') {
      return part.text;
    }
  }

  return null;
}

/**
 * Translate a Responses API response body to Chat Completions response format
 *
 * Field mappings:
 * - id → id (direct copy, fallback to empty string)
 * - model → model (direct copy, fallback to empty string)
 * - output[0].content[0].text → choices[0].message.content
 * - output[0].role → choices[0].message.role (default: 'assistant')
 * - stop_reason → choices[0].finish_reason (via mapStopReason)
 * - usage.input_tokens → usage.prompt_tokens
 * - usage.output_tokens → usage.completion_tokens
 * - usage.total_tokens → usage.total_tokens
 * - object is always set to 'chat.completion'
 *
 * @param response The raw Responses API response body (unknown type — validated internally)
 * @returns ResponseToChatTranslationResult with translated body or error details
 */
export function translateResponseApiToChatResponse(
  response: unknown
): ResponseToChatTranslationResult {
  try {
    // Validate input is a non-null object
    if (typeof response !== 'object' || response === null) {
      return {
        success: false,
        error: 'Response must be a valid object'
      };
    }

    const resp = response as ResponseApiResponse;

    // Validate output array exists and is non-empty
    if (!Array.isArray(resp.output) || resp.output.length === 0) {
      return {
        success: false,
        error: 'Response output array is missing or empty'
      };
    }

    // Extract text content from first output item
    const content = extractOutputText(resp.output);
    if (content === null) {
      return {
        success: false,
        error: 'Response output contains no extractable text content'
      };
    }

    // Extract role from first output item (default to 'assistant')
    const firstItem = resp.output[0];
    const role = typeof firstItem.role === 'string' ? firstItem.role : 'assistant';

    // Build the Chat Completions response
    const translated: ChatCompletionsResponse = {
      id: typeof resp.id === 'string' ? resp.id : '',
      object: 'chat.completion',
      model: typeof resp.model === 'string' ? resp.model : '',
      choices: [
        {
          index: 0,
          message: {
            role,
            content
          },
          finish_reason: mapStopReason(resp.stop_reason)
        }
      ]
    };

    // Map usage if present
    if (typeof resp.usage === 'object' && resp.usage !== null) {
      const u = resp.usage;
      translated.usage = {
        prompt_tokens: typeof u.input_tokens === 'number' ? u.input_tokens : 0,
        completion_tokens: typeof u.output_tokens === 'number' ? u.output_tokens : 0,
        total_tokens: typeof u.total_tokens === 'number' ? u.total_tokens : 0
      };
    }

    return {
      success: true,
      translated
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
