/**
 * Unit tests for Response API → Chat Completions translation
 */

import { describe, it, expect } from 'vitest';
import { translateResponseApiToChatResponse } from '../../../src/translation/response-to-chat/response.js';

const validResponse = {
  id: 'resp_1',
  object: 'response',
  model: 'gpt-4',
  output: [
    {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'Hello!' }]
    }
  ],
  stop_reason: 'end_turn'
};

describe('translateResponseApiToChatResponse', () => {
  // Happy path tests

  it('should return success with choices array for valid Responses API response', () => {
    const result = translateResponseApiToChatResponse(validResponse);
    expect(result.success).toBe(true);
    expect(result.translated).toBeDefined();
    expect(Array.isArray(result.translated?.choices)).toBe(true);
    expect(result.translated?.choices).toHaveLength(1);
  });

  it('should map output text to choices[0].message.content', () => {
    const result = translateResponseApiToChatResponse(validResponse);
    expect(result.translated?.choices[0].message.content).toBe('Hello!');
  });

  it('should set choices[0].message.role to assistant', () => {
    const result = translateResponseApiToChatResponse(validResponse);
    expect(result.translated?.choices[0].message.role).toBe('assistant');
  });

  it('should map stop_reason end_turn to finish_reason stop', () => {
    const response = { ...validResponse, stop_reason: 'end_turn' };
    const result = translateResponseApiToChatResponse(response);
    expect(result.translated?.choices[0].finish_reason).toBe('stop');
  });

  it('should map stop_reason max_tokens to finish_reason length', () => {
    const response = { ...validResponse, stop_reason: 'max_tokens' };
    const result = translateResponseApiToChatResponse(response);
    expect(result.translated?.choices[0].finish_reason).toBe('length');
  });

  it('should map stop_reason tool_calls to finish_reason tool_calls', () => {
    const response = { ...validResponse, stop_reason: 'tool_calls' };
    const result = translateResponseApiToChatResponse(response);
    expect(result.translated?.choices[0].finish_reason).toBe('tool_calls');
  });

  it('should map unknown stop_reason to finish_reason stop', () => {
    const response = { ...validResponse, stop_reason: 'some_future_reason' };
    const result = translateResponseApiToChatResponse(response);
    expect(result.translated?.choices[0].finish_reason).toBe('stop');
  });

  it('should set object to chat.completion', () => {
    const result = translateResponseApiToChatResponse(validResponse);
    expect(result.translated?.object).toBe('chat.completion');
  });

  it('should preserve model from input response', () => {
    const response = { ...validResponse, model: 'gpt-4-turbo' };
    const result = translateResponseApiToChatResponse(response);
    expect(result.translated?.model).toBe('gpt-4-turbo');
  });

  it('should preserve id from input response', () => {
    const response = { ...validResponse, id: 'resp_abc123' };
    const result = translateResponseApiToChatResponse(response);
    expect(result.translated?.id).toBe('resp_abc123');
  });

  // Usage mapping tests

  it('should map usage fields: input_tokens to prompt_tokens, output_tokens to completion_tokens', () => {
    const response = {
      ...validResponse,
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 }
    };
    const result = translateResponseApiToChatResponse(response);
    expect(result.translated?.usage?.prompt_tokens).toBe(10);
    expect(result.translated?.usage?.completion_tokens).toBe(5);
    expect(result.translated?.usage?.total_tokens).toBe(15);
  });

  it('should omit usage when not present in source', () => {
    const { usage: _usage, ...responseWithoutUsage } = validResponse as Record<string, unknown>;
    const result = translateResponseApiToChatResponse(responseWithoutUsage);
    expect(result.translated?.usage).toBeUndefined();
  });

  // Error path tests

  it('should return success false for null input', () => {
    const result = translateResponseApiToChatResponse(null);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('should return success false for non-object input', () => {
    const result = translateResponseApiToChatResponse('not an object');
    expect(result.success).toBe(false);
  });

  it('should return success false when output array is missing', () => {
    const response = { id: 'resp_1', model: 'gpt-4' };
    const result = translateResponseApiToChatResponse(response);
    expect(result.success).toBe(false);
  });

  it('should return success false when output array is empty', () => {
    const response = { id: 'resp_1', model: 'gpt-4', output: [] };
    const result = translateResponseApiToChatResponse(response);
    expect(result.success).toBe(false);
  });

  it('should return success false when first output item has no content', () => {
    const response = { id: 'resp_1', model: 'gpt-4', output: [{ type: 'message' }] };
    const result = translateResponseApiToChatResponse(response);
    expect(result.success).toBe(false);
  });

  it('should not throw on unexpected input shape — structured error only', () => {
    expect(() => {
      const result = translateResponseApiToChatResponse({ output: 'not an array' });
      expect(result.success).toBe(false);
    }).not.toThrow();
  });
});
