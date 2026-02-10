import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { pathToFileURL } from 'node:url';

export type BuildServerOptions = {
  logger?: FastifyServerOptions['logger'];
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

  app.get('/health', async () => {
    return { status: 'ok' };
  });

  return app;
}

export async function startServer(): Promise<void> {
  const app = buildServer();

  try {
    const port = Number.parseInt(process.env.PORT ?? '3000', 10);

    await app.listen({ port, host: '0.0.0.0' });
    app.log.info({ action: 'server_started', port });
  } catch (error) {
    app.log.error({ action: 'server_start_failed', error });
    process.exitCode = 1;
  }
}

const entryFile = process.argv[1];
if (entryFile) {
  const isMain = import.meta.url === pathToFileURL(entryFile).href;
  if (isMain) {
    void startServer();
  }
}
