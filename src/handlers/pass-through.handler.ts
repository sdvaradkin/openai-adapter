import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AdapterConfig } from '../config/types.js';
import { buildUpstreamUrl, forwardHeaders, proxyToUpstream, sendProxyResponse } from './upstream-proxy.js';

export type PassThroughHandlerOptions = {
  config: AdapterConfig;
};

export function createPassThroughHandler(
  endpoint: string,
  options: PassThroughHandlerOptions
) {
  const { config } = options;

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const timeoutMs = config.upstreamTimeoutSeconds * 1000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const upstream = await proxyToUpstream({
        url: buildUpstreamUrl(config.targetUrl, endpoint),
        method: request.method,
        headers: forwardHeaders(request.headers),
        body: request.method !== 'GET' && request.method !== 'HEAD'
          ? JSON.stringify(request.body)
          : undefined,
        signal: controller.signal
      });

      request.log.info({
        action: 'pass_through_request',
        endpoint,
        model: (request.body as Record<string, unknown>)?.model,
        status: upstream.status
      });

      sendProxyResponse(reply, upstream);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        request.log.error({
          action: 'upstream_timeout',
          endpoint,
          timeout_seconds: config.upstreamTimeoutSeconds
        });
        return reply.code(504).send({
          error: 'Gateway Timeout',
          message: `OpenAI request timed out after ${config.upstreamTimeoutSeconds}s`
        });
      }

      const errorDetails = error instanceof Error
        ? {
            message: error.message,
            name: error.name,
            code: (error as NodeJS.ErrnoException)?.code,
            cause: (error as Error & { cause?: unknown })?.cause,
            stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
          }
        : { error: String(error) };

      request.log.error({
        action: 'upstream_error',
        endpoint,
        targetUrl: config.targetUrl,
        upstream_url: buildUpstreamUrl(config.targetUrl, endpoint),
        ...errorDetails,
        error_source: 'openai_connection'
      });

      return reply.code(503).send({
        error: 'Service Unavailable',
        message: 'Failed to communicate with OpenAI API',
        details: process.env.NODE_ENV === 'production' ? undefined : {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : undefined,
          targetUrl: config.targetUrl,
          upstreamUrl: buildUpstreamUrl(config.targetUrl, endpoint)
        }
      });
    } finally {
      clearTimeout(timeoutId);
    }
  };
}
