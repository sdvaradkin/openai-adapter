import { describe, expect, it } from 'vitest';
import { execSync } from 'child_process';

describe('Regression Tests - Docker Image Validation', () => {
  const imageName = process.env.DOCKER_IMAGE || 'openai-adapter:test';

  it('configures non-root user', () => {
    const user = execSync(`docker inspect ${imageName} --format="{{.Config.User}}"`, {
      encoding: 'utf-8'
    }).trim();

    expect(user).not.toBe('');
    expect(user).not.toBe('root');
    expect(user).not.toBe('0');
  });

  it('has image size under 250MB', () => {
    const sizeBytes = execSync(`docker inspect ${imageName} --format="{{.Size}}"`, {
      encoding: 'utf-8'
    }).trim();

    const sizeMB = Number(sizeBytes) / (1024 * 1024);
    expect(sizeMB).toBeLessThan(250);
  });

  it('exposes port 3000', () => {
    const ports = execSync(`docker inspect ${imageName} --format="{{json .Config.ExposedPorts}}"`, {
      encoding: 'utf-8'
    }).trim();

    expect(ports).toContain('3000/tcp');
  });

  it('sets NODE_ENV to production', () => {
    const env = execSync(`docker inspect ${imageName} --format="{{json .Config.Env}}"`, {
      encoding: 'utf-8'
    }).trim();

    expect(env).toContain('NODE_ENV=production');
  });
});
