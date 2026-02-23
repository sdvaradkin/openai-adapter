/**
 * Responses API → Chat Completions request translation
 * Implements field mapping from Responses API request format to Chat Completions request format
 */

import type { ChatCompletionsRequest } from '../types.js';
import { detectUnknownResponseFields, isDroppedResponseField } from '../utils/unknown-fields.js';

/**
 * Result returned by translateResponseToChatRequest
 */
export interface ResponseToChatRequestTranslationResult {
  success: boolean;
  translated?: ChatCompletionsRequest;
  error?: string;
  unknownFields: string[];
}

/**
 * Options for Response → Chat request translation
 */
export interface ResponseToChatRequestTranslationOptions {
  requestId: string;
}

/**
 * Translate a Responses API request body to Chat Completions request format.
 *
 * Field mappings:
 * - model → model (direct copy, required)
 * - input (string) → messages [{role:'user', content: input}]
 * - input (array) → messages (direct copy)
 * - instructions → prepend {role:'system', content: instructions} to messages
 * - temperature → temperature (optional)
 * - max_output_tokens → max_tokens (optional)
 * - top_p → top_p (optional)
 * - stream → stream (optional)
 * - text.format → response_format.type (optional)
 * - previous_response_id, store, reasoning, reasoning_effort, background, truncation, include, user → DROPPED (logged via unknownFields)
 *
 * @param request The raw Responses API request body (unknown type — validated internally)
 * @param _options Translation options (requestId for correlation)
 * @returns ResponseToChatRequestTranslationResult with translated body or error details
 */
export function translateResponseToChatRequest(
  request: unknown,
  _options: ResponseToChatRequestTranslationOptions
): ResponseToChatRequestTranslationResult {
  try {
    // Validate input is a non-null object
    if (typeof request !== 'object' || request === null) {
      return { success: false, error: 'Request must be a valid object', unknownFields: [] };
    }

    const req = request as Record<string, unknown>;

    // Validate model (required)
    const model = req['model'];
    if (typeof model !== 'string' || model.length === 0) {
      return { success: false, error: 'model field is required', unknownFields: [] };
    }

    // Detect unknown fields (fields not in KNOWN_RESPONSE_FIELDS)
    const { unknownFields: detectedUnknownFields } = detectUnknownResponseFields(req);

    // Also collect dropped response fields that ARE in KNOWN_RESPONSE_FIELDS
    // (e.g., previous_response_id is in KNOWN_RESPONSE_FIELDS but should be tracked as dropped)
    const droppedKnownFields: string[] = Object.keys(req).filter(
      (key) => isDroppedResponseField(key) && !detectedUnknownFields.includes(key)
    );

    // Combine: all unknown fields + dropped known fields
    const unknownFields = [...detectedUnknownFields, ...droppedKnownFields];

    // Build messages array
    let messages: Array<{ role: string; content: string }> = [];

    // Handle instructions → prepend system message
    if (typeof req['instructions'] === 'string') {
      messages.push({ role: 'system', content: req['instructions'] });
    }

    // Handle input field (string or array) — required
    const input = req['input'];
    if (typeof input === 'string') {
      messages.push({ role: 'user', content: input });
    } else if (Array.isArray(input)) {
      messages = [...messages, ...(input as Array<{ role: string; content: string }>)];
    } else {
      return { success: false, error: 'input field is required and must be a string or array', unknownFields };
    }

    const chatRequest: ChatCompletionsRequest = { model, messages };

    // Map optional fields
    if (typeof req['temperature'] === 'number') {
      chatRequest.temperature = req['temperature'];
    }
    if (typeof req['max_output_tokens'] === 'number') {
      chatRequest.max_tokens = req['max_output_tokens'];
    }
    if (typeof req['top_p'] === 'number') {
      chatRequest.top_p = req['top_p'];
    }
    if (typeof req['stream'] === 'boolean') {
      chatRequest.stream = req['stream'];
    }

    // Map text.format → response_format.type
    if (typeof req['text'] === 'object' && req['text'] !== null) {
      const text = req['text'] as Record<string, unknown>;
      if (typeof text['format'] === 'string') {
        chatRequest.response_format = { type: text['format'] };
      }
    }

    return { success: true, translated: chatRequest, unknownFields };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      unknownFields: []
    };
  }
}
