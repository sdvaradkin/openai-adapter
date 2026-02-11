import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { pathToFileURL } from 'node:url';
import type { AdapterConfig } from './config/types.js';
import { loadConfiguration } from './config/loader.js';
import { getHealth, getReadiness } from './handlers/health.js';
import { setConfigValid, setConfigInvalid } from './config/state.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: AdapterConfig;
  }
}

export type BuildServerOptions = {
  logger?: FastifyServerOptions['logger'];
  config?: AdapterConfig;
};

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const logger: FastifyServerOptions['logger'] =
    options.logger !== undefined
      ? options.logger
      : process.env.LOG_PRETTY === '1'
        ? {
            level: 'info',
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true
              }
            }
          }
        : {
            level: 'info'
          };

  const app = Fastify({ logger });

  if (options.config) {
    app.decorate('config', options.config);
  }

  // Register hook to exclude health/readiness from request logging
  // These endpoints are called frequently by orchestration platforms
  // and shouldn't clutter application logs
  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health' || request.url === '/ready') {
      request.skipLogging = true;
    }
  });

  // Health endpoint - Kubernetes liveness probe
  // Always returns 200 if process is alive
  app.get('/health', getHealth);

  // Readiness endpoint - Kubernetes readiness probe
  // Returns 200 if ready to accept traffic, 503 otherwise
  app.get('/ready', getReadiness);

  return app;
}

export async function startServer(): Promise<void> {
  try {
    // Load and validate configuration
    const config = await loadConfiguration();
    
    console.log(JSON.stringify({ 
      level: 'info',
      msg: 'Configuration loaded successfully',
      targetUrl: config.targetUrl,
      modelCount: Object.keys(config.modelMapping).length 
    }));

    // Set global config state to valid for readiness handler
    setConfigValid(config);

    const app = buildServer({ config });

    const port = Number.parseInt(process.env.PORT ?? '3000', 10);

    await app.listen({ port, host: '0.0.0.0' });
    app.log.info({ action: 'server_started', port });
  } catch (error) {
    // Set global config state to invalid for readiness handler
    setConfigInvalid(error instanceof Error ? error : new Error(String(error)));

    console.error(JSON.stringify({
      level: 'error',
      msg: 'Configuration validation failed',
      error: error instanceof Error ? error.message : String(error),
      action: 'server_start_failed'
    }));
    process.exit(1);
  }
}

const entryFile = process.argv[1];
if (entryFile) {
  const isMain = import.meta.url === pathToFileURL(entryFile).href;
  if (isMain) {
    void startServer();
  }
}
