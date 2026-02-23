/**
 * Translation module exports
 * Provides access to all translation utilities and translation functions
 */

// Utilities
export * from './utils/unknown-fields.js';
export * from './utils/translation-logger.js';
export * from './utils/round-trip-tester.js';

// Types
export * from './types.js';

// Chat → Response translation
export * from './chat-to-response/types.js';
export * from './chat-to-response/request.js';

// Response → Chat translation
export * from './response-to-chat/types.js';
export * from './response-to-chat/response.js';
export { translateResponseApiToChatResponse } from './response-to-chat/response.js';

// Main exports for convenience
export { translateChatToResponse, isChatCompletionsRequest } from './chat-to-response/request.js';
