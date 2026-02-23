/**
 * Response API -> Chat Completions translation types
 */

import type { TranslationResult, ChatCompletionsRequest, ChatCompletionsResponse } from '../types.js';

/**
 * Result of Response -> Chat request translation
 */
export interface ResponseToChatRequestTranslationResult extends TranslationResult<ChatCompletionsRequest> {
  unknownFields: string[];
}

/**
 * Result of Response -> Chat response translation
 */
export interface ResponseToChatTranslationResult extends TranslationResult<ChatCompletionsResponse> {}
