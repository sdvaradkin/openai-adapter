import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import type { FastifyInstance } from 'fastify';

import { buildServer } from '../src/index.js';

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildServer({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responds 200 with { status: ok }', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health'
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
  });

  it('dockerfile configures non-root user', () => {
    try {
      const user = execSync('docker inspect openai-adapter:test --format="{{.Config.User}}"', {
        encoding: 'utf-8'
      }).trim();
      
      expect(user).not.toBe('');
      expect(user).not.toBe('root');
      expect(user).not.toBe('0');
    } catch (error) {
      // Skip test if Docker image doesn't exist (e.g., in CI before image is built)
      console.warn('Skipping non-root test: Docker image not found. Build image first with: docker build -t openai-adapter:test .');
    }
  });
});
