import type { FastifyRequest, FastifyReply } from 'fastify';
import { Router } from '../routing/router.js';
import { ModelMapper } from '../routing/model-mapper.js';
import { createPassThroughHandler } from './pass-through.handler.js';
import { handleChatToResponseTranslation } from './translation.handler.js';
import { translateResponseApiToChatResponse } from '../translation/index.js';
import type { AdapterConfig } from '../config/types.js';
import { validateJsonDepth } from '../validation/json-depth-validator.js';
import { isValidationError } from '../types/validation-errors.js';
import { formatValidationError } from './error-formatter.js';

/**
 * Routing handler - determines whether to use pass-through or translation
 * Entry point for both /v1/responses and /v1/chat/completions endpoints
 */

export function createRoutingHandler(config: AdapterConfig) {
  const modelMapper = new ModelMapper(config.modelMapping);
  const router = new Router(modelMapper);

  // Create pass-through handlers once for reuse
  const responsesHandler = createPassThroughHandler('responses', { config });
  const chatCompletionsHandler = createPassThroughHandler('chat/completions', { config });

  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Step 1: Validate JSON depth (must happen after JSON parsing, before routing)
      validateJsonDepth(request.body, config.maxJsonDepth);

      // Determine endpoint from path
      let endpoint: string;
      let passThroughHandler: ReturnType<typeof createPassThroughHandler>;

      if (request.url.includes('/v1/responses')) {
        endpoint = 'responses';
        passThroughHandler = responsesHandler;
      } else if (request.url.includes('/v1/chat/completions')) {
        endpoint = 'chat/completions';
        passThroughHandler = chatCompletionsHandler;
      } else {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Unknown endpoint'
        });
      }

      // Step 2: Make routing decision (includes model validation)
      const routingResult = router.routingDecision(request.url, request.body);

      request.log.info({
        action: 'routing_decision',
        endpoint,
        model: routingResult.model,
        source_format: routingResult.sourceFormat,
        target_format: routingResult.targetFormat,
        decision: routingResult.decision
      });

      // Route based on decision
      if (routingResult.decision === 'pass-through') {
        // Forward to pass-through handler (reuse pre-created handler)
        return passThroughHandler(request, reply);
      } else {
        // Translation required - invoke translation handler for Chat→Response
        if (
          routingResult.sourceFormat === 'chat_completions' &&
          routingResult.targetFormat === 'response'
        ) {
          // Perform request translation (Chat → Responses API)
          const chatTranslationResult = handleChatToResponseTranslation(
            request.log,
            request.id,
            request.body
          );

          if (!chatTranslationResult.success) {
            request.log.warn({
              action: 'translation_failed',
              endpoint,
              model: routingResult.model,
              error: chatTranslationResult.error
            });

            return reply.code(400).send({
              error: 'Translation Error',
              message: chatTranslationResult.error,
              requestId: request.id
            });
          }

          request.log.debug({
            action: 'translation_completed',
            endpoint,
            model: routingResult.model
          });

          // Build upstream URL for Responses API endpoint
          const upstreamUrl = `${config.targetUrl.replace(/\/$/, '')}/v1/responses`;

          // Forward headers (skip host, content-length, transfer-encoding)
          const forwardedHeaders = new Headers();
          for (const [key, value] of Object.entries(request.headers)) {
            if (key.toLowerCase() === 'host') continue;
            if (key.toLowerCase() === 'content-length') continue;
            if (key.toLowerCase() === 'transfer-encoding') continue;
            if (typeof value === 'string') {
              forwardedHeaders.set(key, value);
            }
          }

          // Create abort signal with timeout
          const timeoutMs = config.upstreamTimeoutSeconds * 1000;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

          try {
            // Fetch upstream Responses API with translated body
            const upstreamResponse = await fetch(upstreamUrl, {
              method: 'POST',
              headers: forwardedHeaders,
              body: JSON.stringify(chatTranslationResult.translated),
              signal: controller.signal
            });

            request.log.info({
              action: 'upstream_request',
              endpoint: 'responses',
              model: routingResult.model,
              status: upstreamResponse.status
            });

            // Read upstream response body
            let responseText: string;
            try {
              responseText = await upstreamResponse.text();
            } catch (readError) {
              request.log.error({
                action: 'response_body_read_error',
                error: readError instanceof Error ? readError.message : String(readError)
              });
              return reply.code(502).send({
                error: 'Bad Gateway',
                message: 'Failed to read upstream response'
              });
            }

            // Parse upstream response body
            let parsedBody: unknown;
            try {
              parsedBody = JSON.parse(responseText);
            } catch {
              request.log.warn({
                action: 'response_parse_failed',
                endpoint,
                model: routingResult.model,
                status: upstreamResponse.status
              });
              return reply.code(502).send({
                error: 'Bad Gateway',
                message: 'Upstream returned non-JSON response'
              });
            }

            // Translate Responses API response → Chat Completions response
            let responseToChatResult: ReturnType<typeof translateResponseApiToChatResponse>;
            try {
              responseToChatResult = translateResponseApiToChatResponse(parsedBody);
            } catch (translateError) {
              request.log.warn({
                action: 'response_translation_failed',
                endpoint,
                model: routingResult.model,
                error: translateError instanceof Error ? translateError.message : String(translateError)
              });
              return reply.code(502).send({
                error: 'Bad Gateway',
                message: 'Failed to translate upstream response'
              });
            }

            if (!responseToChatResult.success) {
              request.log.warn({
                action: 'response_translation_failed',
                endpoint,
                model: routingResult.model,
                error: responseToChatResult.error
              });
              return reply.code(502).send({
                error: 'Bad Gateway',
                message: 'Failed to translate upstream response'
              });
            }

            // Forward upstream response headers to client
            upstreamResponse.headers.forEach((value, key) => {
              reply.header(key, value);
            });

            // Return translated Chat Completions response
            return reply
              .code(upstreamResponse.status)
              .type('application/json')
              .send(JSON.stringify(responseToChatResult.translated));

          } finally {
            clearTimeout(timeoutId);
          }

        } else {
          // Other translation directions not yet implemented
          request.log.warn({
            action: 'translation_not_implemented',
            endpoint,
            source: routingResult.sourceFormat,
            target: routingResult.targetFormat,
            message: `Translation from ${routingResult.sourceFormat} to ${routingResult.targetFormat} not yet implemented`
          });

          return reply.code(501).send({
            error: 'Not Implemented',
            message: `Translation from ${routingResult.sourceFormat} to ${routingResult.targetFormat} not yet implemented`,
            sourceFormat: routingResult.sourceFormat,
            targetFormat: routingResult.targetFormat
          });
        }
      }
    } catch (error) {
      // Handle timeout (AbortError from fetch)
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

      // Handle validation/routing errors
      request.log.error({
        action: 'routing_error',
        error: error instanceof Error ? error.message : String(error)
      });

      // Handle ValidationError with standardized error format
      if (isValidationError(error)) {
        const errorResponse = formatValidationError(error, request.id);
        return reply.code(400).send(errorResponse);
      }

      // Handle other errors
      const errorMessage = error instanceof Error ? error.message : String(error);

      return reply.code(400).send({
        error: 'Bad Request',
        message: errorMessage,
        requestId: request.id
      });
    }
  };
}
