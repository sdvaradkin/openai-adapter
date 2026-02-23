/**
 * Unknown fields handler utility
 * Identifies and passes through unknown fields for forward compatibility
 */

import type { UnknownFieldsResult } from '../types.js';

const KNOWN_CHAT_FIELDS = new Set([
  'model',
  'messages',
  'temperature',
  'max_tokens',
  'max_completion_tokens',
  'top_p',
  'frequency_penalty',
  'presence_penalty',
  'n',
  'stream',
  'tools',
  'tool_choice',
  'response_format',
  'metadata',
  'stop',
  'logprobs',
  'top_logprobs'
]);

const KNOWN_RESPONSE_FIELDS = new Set([
  'model',
  'input',
  'instructions',
  'temperature',
  'max_output_tokens',
  'top_p',
  'stream',
  'tools',
  'tool_choice',
  'text',
  'metadata',
  'previous_response_id'
]);

/**
 * Fields that are explicitly NOT passed through (unsupported, dropped)
 * These are Chat fields that have no Response API equivalent
 */
const DROPPED_FIELDS = new Set([
  'frequency_penalty',
  'presence_penalty',
  'n',
  'stop',
  'logprobs',
  'top_logprobs'
]);

/**
 * Detect unknown fields in Chat Completions request.
 * Unknown fields are passed through for forward compatibility.
 */
export function detectUnknownChatFields(
  payload: Record<string, unknown>
): UnknownFieldsResult {
  const unknownFields: string[] = [];

  for (const key of Object.keys(payload)) {
    if (!KNOWN_CHAT_FIELDS.has(key)) {
      unknownFields.push(key);
    }
  }

  return { unknownFields };
}

/**
 * Detect unknown fields in Response API request.
 */
export function detectUnknownResponseFields(
  payload: Record<string, unknown>
): UnknownFieldsResult {
  const unknownFields: string[] = [];

  for (const [key, value] of Object.entries(payload)) {
    if (key === 'text' && typeof value === 'object' && value !== null) {
      const textObj = value as Record<string, unknown>;
      const unknownTextFields = Object.keys(textObj).filter(
        (textKey) => !['format'].includes(textKey)
      );
      for (const field of unknownTextFields) {
        unknownFields.push(`text.${field}`);
      }
    } else if (!KNOWN_RESPONSE_FIELDS.has(key)) {
      unknownFields.push(key);
    }
  }

  return { unknownFields };
}

/**
 * Check if a field should be dropped during Chat->Response translation
 */
export function isDroppedField(fieldName: string): boolean {
  return DROPPED_FIELDS.has(fieldName);
}

export function getKnownChatFields(): string[] {
  return Array.from(KNOWN_CHAT_FIELDS);
}

export function getKnownResponseFields(): string[] {
  return Array.from(KNOWN_RESPONSE_FIELDS);
}

export function getDroppedFields(): string[] {
  return Array.from(DROPPED_FIELDS);
}

/**
 * Fields that are Responses API-only with no Chat Completions equivalent.
 * Dropped during Response->Chat request translation.
 */
const DROPPED_RESPONSE_FIELDS = new Set([
  'previous_response_id',
  'store',
  'reasoning',
  'reasoning_effort',
  'background',
  'truncation',
  'include',
  'user',
]);

export function isDroppedResponseField(fieldName: string): boolean {
  return DROPPED_RESPONSE_FIELDS.has(fieldName);
}

export function getDroppedResponseFields(): string[] {
  return Array.from(DROPPED_RESPONSE_FIELDS);
}
