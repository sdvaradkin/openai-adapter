import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { pathToFileURL } from 'node:url';
import type { AdapterConfig } from './config/types.js';
import { loadConfiguration } from './config/loader.js';

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

  app.get('/health', async () => {
    return { status: 'ok' };
  });

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

    const app = buildServer({ config });

    const port = Number.parseInt(process.env.PORT ?? '3000', 10);

    await app.listen({ port, host: '0.0.0.0' });
    app.log.info({ action: 'server_started', port });
  } catch (error) {
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
