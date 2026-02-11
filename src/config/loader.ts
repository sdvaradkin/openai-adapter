import envSchema from 'env-schema';
import { readFile } from 'node:fs/promises';
import type { AdapterConfig, ModelMapping } from './types.js';
import { validateModelMapping } from './validator.js';

interface EnvConfig {
  ADAPTER_TARGET_URL: string;
  MODEL_API_MAPPING_FILE: string;
}

const schema = {
  type: 'object',
  required: ['ADAPTER_TARGET_URL', 'MODEL_API_MAPPING_FILE'],
  properties: {
    ADAPTER_TARGET_URL: {
      type: 'string',
      pattern: '^https?://.+'
    },
    MODEL_API_MAPPING_FILE: {
      type: 'string',
      minLength: 1
    }
  }
} as const;

export function loadEnvConfig(): EnvConfig {
  try {
    return envSchema<EnvConfig>({
      schema,
      data: process.env,
      dotenv: false
    });
  } catch (error) {
    if (error instanceof Error) {
      let message = `Environment variable validation failed: ${error.message}.`;
      
      // Add resolution guidance
      if (error.message.includes('ADAPTER_TARGET_URL')) {
        message += ' Set ADAPTER_TARGET_URL to a valid HTTP/HTTPS URL like https://api.openai.com/v1';
      } else if (error.message.includes('MODEL_API_MAPPING_FILE')) {
        message += ' Set MODEL_API_MAPPING_FILE to the path of your JSON configuration file.';
      }
      
      throw new Error(message);
    }
    throw error;
  }
}

function detectDuplicateKeys(jsonContent: string): void {
  // Simple regex to find keys in a flat JSON object
  // Matches "key":
  const keyRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"\s*:/g;
  const keys = new Set<string>();
  let match;

  while ((match = keyRegex.exec(jsonContent)) !== null) {
    const key = match[1];
    if (keys.has(key)) {
      throw new Error(`Duplicate model name found in mapping file: "${key}"`);
    }
    keys.add(key);
  }
}

export async function loadModelMappingFile(filePath: string): Promise<ModelMapping> {
  try {
    const content = await readFile(filePath, 'utf-8');
    
    // Check for duplicates before parsing
    try {
      detectDuplicateKeys(content);
    } catch (wsError) {
      // If regex fails or finds dupes, we prioritize that error if it looks like a duplicate key error
      if (wsError instanceof Error && wsError.message.includes('Duplicate model name')) {
        throw wsError;
      }
      // Otherwise proceed to JSON.parse to handle syntax errors properly
    }

    try {
      const parsed = JSON.parse(content);
      return parsed as ModelMapping;
    } catch (parseError) {
      if (parseError instanceof SyntaxError) {
        throw new Error(
          `Invalid JSON in model mapping file: ${parseError.message}`
        );
      }
      throw parseError;
    }
  } catch (error) {
    if (error instanceof Error) {
      if ('code' in error && error.code === 'ENOENT') {
        throw new Error(
          `Model mapping file not found at path: ${filePath}. ` +
          `Ensure the file exists and MODEL_API_MAPPING_FILE is set correctly.`
        );
      }
      if ('code' in error && error.code === 'EACCES') {
        throw new Error(
          `Cannot read model mapping file at ${filePath}. Check file permissions.`
        );
      }
      throw error;
    }
    throw error;
  }
}

export async function loadConfiguration(): Promise<AdapterConfig> {
  const envConfig = loadEnvConfig();
  
  const rawMapping = await loadModelMappingFile(envConfig.MODEL_API_MAPPING_FILE);
  const modelMapping = validateModelMapping(rawMapping);
  
  return {
    targetUrl: envConfig.ADAPTER_TARGET_URL,
    modelMappingFile: envConfig.MODEL_API_MAPPING_FILE,
    modelMapping
  };
}
