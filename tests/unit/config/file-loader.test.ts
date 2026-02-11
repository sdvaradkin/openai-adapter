import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadModelMappingFile } from '../../../src/config/loader.js';

describe('loadModelMappingFile', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `test-config-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should load and parse valid JSON file', async () => {
    const filePath = join(testDir, 'mapping.json');
    await writeFile(filePath, JSON.stringify({ 'gpt-4': 'response' }));

    const result = await loadModelMappingFile(filePath);

    expect(result).toEqual({ 'gpt-4': 'response' });
  });

  it('should throw error when file does not exist', async () => {
    const filePath = join(testDir, 'nonexistent.json');

    await expect(loadModelMappingFile(filePath)).rejects.toThrow(/not found at path/);
    await expect(loadModelMappingFile(filePath)).rejects.toThrow(filePath);
  });

  it('should throw error with invalid JSON syntax', async () => {
    const filePath = join(testDir, 'invalid.json');
    await writeFile(filePath, '{ invalid json }');

    await expect(loadModelMappingFile(filePath)).rejects.toThrow(/Invalid JSON/);
  });

  it('should handle permission errors', async () => {
    if (process.platform === 'win32') {
      // Permission tests are unreliable on Windows, skip
      return;
    }

    const filePath = join(testDir, 'unreadable.json');
    await writeFile(filePath, '{}');
    await chmod(filePath, 0o000);

    await expect(loadModelMappingFile(filePath)).rejects.toThrow(/Cannot read/);
    
    // Restore permissions for cleanup
    await chmod(filePath, 0o644);
  });
});
