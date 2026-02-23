/**
 * Unit tests for Chat Completions → Responses API response translation
 */

import { describe, it, expect } from 'vitest';
import { translateChatToResponseApiResponse } from '../../../src/translation/chat-to-response/response.js';

function makeChatCompletionsResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chatcmpl-abc123',
    object: 'chat.completion',
    model: 'gpt-3.5-turbo',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: 'Hello there!' },
        finish_reason: 'stop'
      }
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    ...overrides
  };
}

describe('translateChatToResponseApiResponse', () => {
  // Output array structure tests

  it('should return success with output array for valid Chat Completions response', () => {
    const result = translateChatToResponseApiResponse(makeChatCompletionsResponse());
    expect(result.success).toBe(true);
    expect(Array.isArray(result.translated?.output)).toBe(true);
    expect(result.translated?.output).toHaveLength(1);
  });

  it('should set object to response', () => {
    const result = translateChatToResponseApiResponse(makeChatCompletionsResponse());
    expect(result.translated?.object).toBe('response');
  });

  it('should set top-level status to completed', () => {
    const result = translateChatToResponseApiResponse(makeChatCompletionsResponse());
    expect(result.translated?.status).toBe('completed');
  });

  it('should set output[0].type to message', () => {
    const result = translateChatToResponseApiResponse(makeChatCompletionsResponse());
    expect(result.translated?.output[0].type).toBe('message');
  });

  it('should set output[0].status to completed', () => {
    const result = translateChatToResponseApiResponse(makeChatCompletionsResponse());
    expect(result.translated?.output[0].status).toBe('completed');
  });

  it('should set output[0].content[0].type to output_text', () => {
    const result = translateChatToResponseApiResponse(makeChatCompletionsResponse());
    expect(result.translated?.output[0].content[0].type).toBe('output_text');
  });

  it('should set output[0].content[0].annotations to empty array', () => {
    const result = translateChatToResponseApiResponse(makeChatCompletionsResponse());
    expect(Array.isArray(result.translated?.output[0].content[0].annotations)).toBe(true);
    expect(result.translated?.output[0].content[0].annotations).toHaveLength(0);
  });

  it('should map choices[0].message.content to output[0].content[0].text', () => {
    const result = translateChatToResponseApiResponse(makeChatCompletionsResponse());
    expect(result.translated?.output[0].content[0].text).toBe('Hello there!');
  });

  it('should map choices[0].message.role to output[0].role', () => {
    const result = translateChatToResponseApiResponse(makeChatCompletionsResponse());
    expect(result.translated?.output[0].role).toBe('assistant');
  });

  it('should default output[0].role to assistant when message role is missing', () => {
    const result = translateChatToResponseApiResponse(
      makeChatCompletionsResponse({
        choices: [{ index: 0, message: { content: 'Hi' }, finish_reason: 'stop' }]
      })
    );
    expect(result.translated?.output[0].role).toBe('assistant');
  });

  it('should synthesize output[0].id from response id with msg_ prefix', () => {
    const result = translateChatToResponseApiResponse(
      makeChatCompletionsResponse({ id: 'chatcmpl-xyz' })
    );
    expect(result.translated?.output[0].id).toBe('msg_chatcmpl-xyz');
  });

  it('should preserve model from Chat Completions response', () => {
    const result = translateChatToResponseApiResponse(
      makeChatCompletionsResponse({ model: 'gpt-4' })
    );
    expect(result.translated?.model).toBe('gpt-4');
  });

  it('should preserve id from Chat Completions response', () => {
    const result = translateChatToResponseApiResponse(
      makeChatCompletionsResponse({ id: 'chatcmpl-abc123' })
    );
    expect(result.translated?.id).toBe('chatcmpl-abc123');
  });

  // finish_reason → stop_reason mapping (reverse of Phase 1)

  it('should map finish_reason stop to stop_reason end_turn', () => {
    const result = translateChatToResponseApiResponse(makeChatCompletionsResponse());
    expect(result.translated?.stop_reason).toBe('end_turn');
  });

  it('should map finish_reason length to stop_reason max_tokens', () => {
    const result = translateChatToResponseApiResponse(
      makeChatCompletionsResponse({
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'length' }]
      })
    );
    expect(result.translated?.stop_reason).toBe('max_tokens');
  });

  it('should map finish_reason tool_calls to stop_reason tool_calls', () => {
    const result = translateChatToResponseApiResponse(
      makeChatCompletionsResponse({
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'tool_calls' }]
      })
    );
    expect(result.translated?.stop_reason).toBe('tool_calls');
  });

  it('should map unknown finish_reason to stop_reason end_turn', () => {
    const result = translateChatToResponseApiResponse(
      makeChatCompletionsResponse({
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'content_filter' }]
      })
    );
    expect(result.translated?.stop_reason).toBe('end_turn');
  });

  it('should default stop_reason to end_turn when finish_reason is absent', () => {
    const result = translateChatToResponseApiResponse(
      makeChatCompletionsResponse({
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: null }]
      })
    );
    expect(result.translated?.stop_reason).toBe('end_turn');
  });

  // Usage mapping

  it('should map usage: prompt_tokens to input_tokens, completion_tokens to output_tokens', () => {
    const result = translateChatToResponseApiResponse(makeChatCompletionsResponse());
    expect(result.translated?.usage?.input_tokens).toBe(10);
    expect(result.translated?.usage?.output_tokens).toBe(5);
    expect(result.translated?.usage?.total_tokens).toBe(15);
  });

  it('should omit usage when not present in source', () => {
    const result = translateChatToResponseApiResponse(
      makeChatCompletionsResponse({ usage: undefined })
    );
    expect(result.translated?.usage).toBeUndefined();
  });

  // Error cases

  it('should return success false for null input', () => {
    const result = translateChatToResponseApiResponse(null);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('should return success false for non-object input', () => {
    const result = translateChatToResponseApiResponse('not an object');
    expect(result.success).toBe(false);
  });

  it('should return success false when choices array is missing', () => {
    const result = translateChatToResponseApiResponse({ id: 'c1', model: 'gpt-4' });
    expect(result.success).toBe(false);
  });

  it('should return success false when choices array is empty', () => {
    const result = translateChatToResponseApiResponse({ id: 'c1', model: 'gpt-4', choices: [] });
    expect(result.success).toBe(false);
  });

  it('should return success false when choices[0].message.content is not a string', () => {
    const result = translateChatToResponseApiResponse({
      id: 'c1',
      model: 'gpt-4',
      choices: [{ index: 0, message: { role: 'assistant', content: null }, finish_reason: 'stop' }]
    });
    expect(result.success).toBe(false);
  });

  it('should not throw on unexpected input shape — structured error only', () => {
    expect(() => {
      const result = translateChatToResponseApiResponse({ choices: 'not an array' });
      expect(result.success).toBe(false);
    }).not.toThrow();
  });
});
