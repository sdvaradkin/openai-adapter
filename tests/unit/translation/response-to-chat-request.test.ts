/**
 * Unit tests for Responses API → Chat Completions request translation
 */

import { describe, it, expect } from 'vitest';
import { translateResponseToChatRequest } from '../../../src/translation/response-to-chat/request.js';

describe('translateResponseToChatRequest', () => {
  // Input polymorphism — string input

  it('should wrap string input as a user message in messages array', () => {
    const result = translateResponseToChatRequest(
      { model: 'gpt-3.5-turbo', input: 'Hello world' },
      { requestId: 'test' }
    );
    expect(result.success).toBe(true);
    expect(result.translated!.messages).toHaveLength(1);
    expect(result.translated!.messages[0].role).toBe('user');
    expect(result.translated!.messages[0].content).toBe('Hello world');
  });

  it('should set model in output for string input', () => {
    const result = translateResponseToChatRequest(
      { model: 'gpt-3.5-turbo', input: 'Hi' },
      { requestId: 'test' }
    );
    expect(result.translated!.model).toBe('gpt-3.5-turbo');
  });

  // Input polymorphism — array input

  it('should pass through array input directly as messages', () => {
    const result = translateResponseToChatRequest(
      { model: 'gpt-3.5-turbo', input: [{ role: 'user', content: 'Hello' }] },
      { requestId: 'test' }
    );
    expect(result.success).toBe(true);
    expect(result.translated!.messages[0].role).toBe('user');
    expect(result.translated!.messages[0].content).toBe('Hello');
  });

  it('should pass through multi-message array input preserving order', () => {
    const result = translateResponseToChatRequest(
      {
        model: 'gpt-3.5-turbo',
        input: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi' },
          { role: 'user', content: 'How are you?' }
        ]
      },
      { requestId: 'test' }
    );
    expect(result.translated!.messages).toHaveLength(3);
    expect(result.translated!.messages[2].content).toBe('How are you?');
  });

  // instructions → system message

  it('should prepend system message from instructions when present', () => {
    const result = translateResponseToChatRequest(
      { model: 'gpt-3.5-turbo', input: 'Hello', instructions: 'You are a helpful assistant.' },
      { requestId: 'test' }
    );
    expect(result.translated!.messages[0].role).toBe('system');
    expect(result.translated!.messages[0].content).toBe('You are a helpful assistant.');
    expect(result.translated!.messages[1].role).toBe('user');
  });

  it('should not add system message when instructions is absent', () => {
    const result = translateResponseToChatRequest(
      { model: 'gpt-3.5-turbo', input: 'Hello' },
      { requestId: 'test' }
    );
    expect(result.translated!.messages[0].role).toBe('user');
  });

  it('should prepend system message before array input messages when instructions present', () => {
    const result = translateResponseToChatRequest(
      {
        model: 'gpt-3.5-turbo',
        input: [{ role: 'user', content: 'Hello' }],
        instructions: 'Be concise.'
      },
      { requestId: 'test' }
    );
    expect(result.translated!.messages[0].role).toBe('system');
    expect(result.translated!.messages[0].content).toBe('Be concise.');
    expect(result.translated!.messages[1].role).toBe('user');
  });

  // Optional field mapping

  it('should map temperature when present', () => {
    const result = translateResponseToChatRequest(
      { model: 'gpt-3.5-turbo', input: 'Hi', temperature: 0.7 },
      { requestId: 'test' }
    );
    expect(result.translated!.temperature).toBe(0.7);
  });

  it('should map max_output_tokens to max_tokens', () => {
    const result = translateResponseToChatRequest(
      { model: 'gpt-3.5-turbo', input: 'Hi', max_output_tokens: 200 },
      { requestId: 'test' }
    );
    expect(result.translated!.max_tokens).toBe(200);
  });

  it('should map top_p when present', () => {
    const result = translateResponseToChatRequest(
      { model: 'gpt-3.5-turbo', input: 'Hi', top_p: 0.9 },
      { requestId: 'test' }
    );
    expect(result.translated!.top_p).toBe(0.9);
  });

  it('should map stream when present', () => {
    const result = translateResponseToChatRequest(
      { model: 'gpt-3.5-turbo', input: 'Hi', stream: true },
      { requestId: 'test' }
    );
    expect(result.translated!.stream).toBe(true);
  });

  it('should map text.format to response_format.type', () => {
    const result = translateResponseToChatRequest(
      { model: 'gpt-3.5-turbo', input: 'Hi', text: { format: 'json_object' } },
      { requestId: 'test' }
    );
    expect(result.translated!.response_format?.type).toBe('json_object');
  });

  // Dropped fields (TRANS-03)

  it('should drop previous_response_id and not include it in translated output', () => {
    const result = translateResponseToChatRequest(
      { model: 'gpt-3.5-turbo', input: 'Hi', previous_response_id: 'resp_abc' },
      { requestId: 'test' }
    );
    expect(result.success).toBe(true);
    expect((result.translated as any).previous_response_id).toBeUndefined();
  });

  it('should drop store and not include it in translated output', () => {
    const result = translateResponseToChatRequest(
      { model: 'gpt-3.5-turbo', input: 'Hi', store: true },
      { requestId: 'test' }
    );
    expect(result.success).toBe(true);
    expect((result.translated as any).store).toBeUndefined();
  });

  it('should drop reasoning and not include it in translated output', () => {
    const result = translateResponseToChatRequest(
      { model: 'gpt-3.5-turbo', input: 'Hi', reasoning: { effort: 'high' } },
      { requestId: 'test' }
    );
    expect(result.success).toBe(true);
    expect((result.translated as any).reasoning).toBeUndefined();
  });

  it('should still succeed when multiple dropped fields are present', () => {
    const result = translateResponseToChatRequest(
      {
        model: 'gpt-3.5-turbo',
        input: 'Hi',
        previous_response_id: 'r1',
        store: true,
        background: false,
        truncation: 'auto'
      },
      { requestId: 'test' }
    );
    expect(result.success).toBe(true);
    expect(result.translated!.messages).toBeDefined();
  });

  // unknownFields tracking

  it('should include dropped fields in unknownFields list', () => {
    const result = translateResponseToChatRequest(
      { model: 'gpt-3.5-turbo', input: 'Hi', previous_response_id: 'resp_abc' },
      { requestId: 'test' }
    );
    expect(result.unknownFields).toContain('previous_response_id');
  });

  // Error cases

  it('should return success false for null input', () => {
    const result = translateResponseToChatRequest(null, { requestId: 'test' });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('should return success false for non-object input', () => {
    const result = translateResponseToChatRequest('not an object', { requestId: 'test' });
    expect(result.success).toBe(false);
  });

  it('should return success false when model is missing', () => {
    const result = translateResponseToChatRequest(
      { input: 'Hello' },
      { requestId: 'test' }
    );
    expect(result.success).toBe(false);
  });

  it('should return success false when input field is missing', () => {
    const result = translateResponseToChatRequest(
      { model: 'gpt-3.5-turbo' },
      { requestId: 'test' }
    );
    expect(result.success).toBe(false);
  });

  it('should not throw on unexpected input shape — structured error only', () => {
    const result = translateResponseToChatRequest(
      { model: 'gpt-3.5-turbo', input: 42 },
      { requestId: 'test' }
    );
    expect(result.success).toBe(false);
  });
});
