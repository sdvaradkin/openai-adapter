/**
 * Chat Completions -> Response API translation types
 */

import type { TranslationResult, ResponseApiRequest, ResponseApiFullResponse } from '../types.js';

/**
 * Result of Chat -> Response request translation
 */
export interface ChatToResponseTranslationResult extends TranslationResult<ResponseApiRequest> {
  unknownFields: string[];
  multi_turn_detected: boolean;
}

/**
 * Result of Chat -> Response API response translation
 */
export interface ChatToResponseApiTranslationResult extends TranslationResult<ResponseApiFullResponse> {}
