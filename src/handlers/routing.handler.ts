import type { FastifyRequest, FastifyReply } from 'fastify';
import { Redis } from 'ioredis';
import { Router } from '../routing/router.js';
import { ModelMapper } from '../routing/model-mapper.js';
import { createPassThroughHandler } from './pass-through.handler.js';
import { translateChatToResponse } from '../translation/chat-to-response/request.js';
import { translateResponseApiToChatResponse } from '../translation/response-to-chat/response.js';
import { translateResponseToChatRequest } from '../translation/response-to-chat/request.js';
import { translateChatToResponseApiResponse } from '../translation/chat-to-response/response.js';
import type { AdapterConfig } from '../config/types.js';
import { validateJsonDepth } from '../validation/json-depth-validator.js';
import { isValidationError } from '../types/validation-errors.js';
import { formatValidationError } from './error-formatter.js';
import { buildUpstreamUrl, forwardHeaders, proxyToUpstream, sendProxyResponse } from './upstream-proxy.js';
import { storeTurn, reconstructMessages } from '../history/conversation-store.js';

export function createRoutingHandler(config: AdapterConfig, redis?: Redis) {
  const modelMapper = new ModelMapper(config.modelMapping);
  const router = new Router(modelMapper);

  const responsesHandler = createPassThroughHandler('responses', { config });
  const chatCompletionsHandler = createPassThroughHandler('chat/completions', { config });

  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      validateJsonDepth(request.body, config.maxJsonDepth);

      // Determine endpoint
      let endpoint: string;
      let passThroughHandler: ReturnType<typeof createPassThroughHandler>;

      if (request.url.includes('/v1/responses')) {
        endpoint = 'responses';
        passThroughHandler = responsesHandler;
      } else if (request.url.includes('/v1/chat/completions')) {
        endpoint = 'chat/completions';
        passThroughHandler = chatCompletionsHandler;
      } else {
        return reply.code(404).send({ error: 'Not Found', message: 'Unknown endpoint' });
      }

      // Routing decision
      const routingResult = router.routingDecision(request.url, request.body);

      request.log.info({
        action: 'routing_decision',
        endpoint,
        model: routingResult.model,
        source_format: routingResult.sourceFormat,
        target_format: routingResult.targetFormat,
        decision: routingResult.decision
      });

      if (routingResult.decision === 'pass-through') {
        return passThroughHandler(request, reply);
      }

      // Translation required
      if (
        routingResult.sourceFormat === 'chat_completions' &&
        routingResult.targetFormat === 'response'
      ) {
        await handleChatToResponseFlow(request, reply, config, routingResult, endpoint);
        return;
      }

      if (
        routingResult.sourceFormat === 'response' &&
        routingResult.targetFormat === 'chat_completions'
      ) {
        await handleResponseToChatFlow(request, reply, config, routingResult, endpoint, redis);
        return;
      }

      // Other translation directions not yet implemented
      request.log.warn({
        action: 'translation_not_implemented',
        endpoint,
        source: routingResult.sourceFormat,
        target: routingResult.targetFormat
      });

      return reply.code(501).send({
        error: 'Not Implemented',
        message: `Translation from ${routingResult.sourceFormat} to ${routingResult.targetFormat} not yet implemented`,
        sourceFormat: routingResult.sourceFormat,
        targetFormat: routingResult.targetFormat
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        request.log.error({
          action: 'upstream_timeout',
          timeout_seconds: config.upstreamTimeoutSeconds
        });
        return reply.code(504).send({
          error: 'Gateway Timeout',
          message: `Upstream request timed out after ${config.upstreamTimeoutSeconds}s`
        });
      }

      request.log.error({
        action: 'routing_error',
        error: error instanceof Error ? error.message : String(error)
      });

      if (isValidationError(error)) {
        return reply.code(400).send(formatValidationError(error, request.id));
      }

      return reply.code(400).send({
        error: 'Bad Request',
        message: error instanceof Error ? error.message : String(error),
        requestId: request.id
      });
    }
  };
}

/**
 * Handle the Chat Completions -> Response API translation flow:
 * 1. Translate request
 * 2. Proxy to upstream Responses API
 * 3. Translate response back to Chat Completions format
 */
async function handleChatToResponseFlow(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AdapterConfig,
  routingResult: { model: string },
  endpoint: string
): Promise<void> {
  // 1. Translate request
  const translationResult = translateChatToResponse(request.body);

  if (!translationResult.success) {
    request.log.warn({
      action: 'translation_failed',
      endpoint,
      model: routingResult.model,
      error: translationResult.error
    });
    reply.code(400).send({
      error: 'Translation Error',
      message: translationResult.error,
      requestId: request.id
    });
    return;
  }

  if (translationResult.unknownFields.length > 0) {
    request.log.debug({
      action: 'unknown_fields_detected',
      requestId: request.id,
      direction: 'chat_to_response',
      count: translationResult.unknownFields.length,
      fields: translationResult.unknownFields
    });
  }

  if (translationResult.multi_turn_detected) {
    request.log.info({
      action: 'multi_turn_conversation_detected',
      requestId: request.id,
      direction: 'chat_to_response'
    });
  }

  request.log.debug({
    action: 'translation_completed',
    endpoint,
    model: routingResult.model
  });

  // 2. Proxy to upstream
  const timeoutMs = config.upstreamTimeoutSeconds * 1000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const upstream = await proxyToUpstream({
      url: buildUpstreamUrl(config.targetUrl, 'responses'),
      method: 'POST',
      headers: forwardHeaders(request.headers),
      body: JSON.stringify(translationResult.translated),
      signal: controller.signal
    });

    request.log.info({
      action: 'upstream_request',
      endpoint: 'responses',
      model: routingResult.model,
      status: upstream.status
    });

    // 3. Parse and translate response
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(upstream.body);
    } catch {
      request.log.warn({
        action: 'response_parse_failed',
        endpoint,
        model: routingResult.model,
        status: upstream.status
      });
      reply.code(502).send({
        error: 'Bad Gateway',
        message: 'Upstream returned non-JSON response'
      });
      return;
    }

    const responseToChatResult = translateResponseApiToChatResponse(parsedBody);

    if (!responseToChatResult.success) {
      request.log.warn({
        action: 'response_translation_failed',
        endpoint,
        model: routingResult.model,
        error: responseToChatResult.error
      });
      reply.code(502).send({
        error: 'Bad Gateway',
        message: 'Failed to translate upstream response'
      });
      return;
    }

    sendProxyResponse(reply, upstream, JSON.stringify(responseToChatResult.translated));
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Handle the Responses API -> Chat Completions translation flow:
 * 1. Reconstruct conversation history from Redis (if previous_response_id present)
 * 2. Translate request
 * 3. Prepend prior messages to the translated request
 * 4. Proxy to upstream Chat Completions
 * 5. Translate response back to Responses API format
 * 6. Store the turn in Redis for future history reconstruction
 */
async function handleResponseToChatFlow(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AdapterConfig,
  routingResult: { model: string },
  endpoint: string,
  redis?: Redis
): Promise<void> {
  // Extract previous_response_id from request body
  const body = request.body as Record<string, unknown>;
  const previousResponseId = typeof body['previous_response_id'] === 'string'
    ? body['previous_response_id']
    : null;

  // Reconstruct prior messages if history is available
  let priorMessages: Array<{ role: string; content: string }> = [];
  if (previousResponseId !== null && redis) {
    priorMessages = await reconstructMessages(
      redis,
      previousResponseId,
      config.redisKeyPrefix,
      config.conversationMaxDepth
    );
    if (priorMessages.length > 0) {
      request.log.info({
        action: 'history_reconstructed',
        previousResponseId,
        turns: priorMessages.length / 2
      });
    }
  }

  // 1. Translate Responses API request → Chat Completions request
  const requestTranslationResult = translateResponseToChatRequest(request.body);

  if (!requestTranslationResult.success) {
    request.log.warn({
      action: 'translation_failed',
      endpoint,
      model: routingResult.model,
      error: requestTranslationResult.error
    });
    reply.code(400).send({
      error: 'Translation Error',
      message: requestTranslationResult.error,
      requestId: request.id
    });
    return;
  }

  // Prepend prior messages from history to the translated request
  if (priorMessages.length > 0 && requestTranslationResult.translated) {
    requestTranslationResult.translated.messages = [
      ...priorMessages,
      ...requestTranslationResult.translated.messages
    ];
  }

  // Log dropped fields if any (TRANS-03)
  if (requestTranslationResult.unknownFields.length > 0) {
    request.log.info({
      action: 'translation_fields_dropped',
      endpoint,
      model: routingResult.model,
      dropped_fields: requestTranslationResult.unknownFields
    });
  }

  request.log.debug({
    action: 'translation_completed',
    endpoint,
    model: routingResult.model
  });

  // 2. Proxy to upstream Chat Completions
  const timeoutMs = config.upstreamTimeoutSeconds * 1000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const upstream = await proxyToUpstream({
      url: buildUpstreamUrl(config.targetUrl, 'chat/completions'),
      method: 'POST',
      headers: forwardHeaders(request.headers),
      body: JSON.stringify(requestTranslationResult.translated),
      signal: controller.signal
    });

    request.log.info({
      action: 'upstream_request',
      endpoint: 'chat/completions',
      model: routingResult.model,
      status: upstream.status
    });

    // 3. Parse and translate response
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(upstream.body);
    } catch {
      request.log.warn({
        action: 'response_parse_failed',
        endpoint,
        model: routingResult.model,
        status: upstream.status
      });
      reply.code(502).send({
        error: 'Bad Gateway',
        message: 'Upstream returned non-JSON response'
      });
      return;
    }

    const responseTranslationResult = translateChatToResponseApiResponse(parsedBody);

    if (!responseTranslationResult.success) {
      request.log.warn({
        action: 'response_translation_failed',
        endpoint,
        model: routingResult.model,
        error: responseTranslationResult.error
      });
      reply.code(502).send({
        error: 'Bad Gateway',
        message: 'Failed to translate upstream response'
      });
      return;
    }

    sendProxyResponse(reply, upstream, JSON.stringify(responseTranslationResult.translated));

    // Store this turn for future history reconstruction
    if (redis) {
      const userInput = extractUserInput(body);
      const assistantOutput = extractAssistantOutput(responseTranslationResult.translated);
      const responseId = extractResponseId(responseTranslationResult.translated);

      if (responseId && userInput && assistantOutput) {
        await storeTurn(redis, responseId, {
          userInput,
          assistantOutput,
          previousResponseId,
        }, config.redisKeyPrefix, config.conversationTtlSeconds);
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractUserInput(body: Record<string, unknown>): string | null {
  const input = body['input'];
  if (typeof input === 'string') return input;
  if (Array.isArray(input)) return JSON.stringify(input);
  return null;
}

function extractAssistantOutput(upstreamResponse: unknown): string | null {
  // The upstream response has been translated to Responses API format
  // by translateChatToResponseApiResponse. Extract output text.
  if (typeof upstreamResponse !== 'object' || upstreamResponse === null) return null;
  const resp = upstreamResponse as Record<string, unknown>;
  const output = resp['output'];
  if (!Array.isArray(output)) return null;
  // Find the message output item with assistant content
  for (const item of output) {
    if (typeof item === 'object' && item !== null) {
      const outputItem = item as Record<string, unknown>;
      if (outputItem['type'] === 'message') {
        const content = outputItem['content'];
        if (Array.isArray(content)) {
          for (const part of content) {
            if (typeof part === 'object' && part !== null) {
              const contentPart = part as Record<string, unknown>;
              if (contentPart['type'] === 'output_text' && typeof contentPart['text'] === 'string') {
                return contentPart['text'];
              }
            }
          }
        }
      }
    }
  }
  return null;
}

function extractResponseId(upstreamResponse: unknown): string | null {
  if (typeof upstreamResponse !== 'object' || upstreamResponse === null) return null;
  const resp = upstreamResponse as Record<string, unknown>;
  const id = resp['id'];
  return typeof id === 'string' ? id : null;
}
