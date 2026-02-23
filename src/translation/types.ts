/**
 * Translation types and interfaces
 *
 * Canonical type definitions shared across all translation directions.
 */

// ---------------------------------------------------------------------------
// Base translation result
// ---------------------------------------------------------------------------

/**
 * Every translation function returns at least these fields.
 */
export interface TranslationResult<T> {
  success: boolean;
  translated?: T;
  error?: string;
}

// ---------------------------------------------------------------------------
// Unknown field detection
// ---------------------------------------------------------------------------

export interface UnknownFieldsResult {
  unknownFields: string[];
}

// ---------------------------------------------------------------------------
// Chat Completions API types
// ---------------------------------------------------------------------------

export interface ChatCompletionsRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  n?: number;
  stream?: boolean;
  tools?: Array<Record<string, unknown>>;
  tool_choice?: string | Record<string, unknown>;
  response_format?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ChatCompletionsChoice {
  index: number;
  message: {
    role: string;
    content: string | null;
  };
  finish_reason: string | null;
}

export interface ChatCompletionsResponse {
  id: string;
  object: string;
  model: string;
  choices: ChatCompletionsChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ---------------------------------------------------------------------------
// Response API types
// ---------------------------------------------------------------------------

export interface ResponseApiRequest {
  model: string;
  input?: string | Array<Record<string, unknown>>;
  instructions?: string;
  temperature?: number;
  max_output_tokens?: number;
  top_p?: number;
  stream?: boolean;
  tools?: Array<Record<string, unknown>>;
  tool_choice?: string | Record<string, unknown>;
  text?: {
    format?: string;
  };
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ResponseApiContentItem {
  type: string;
  text: string;
  annotations: unknown[];
}

export interface ResponseApiOutputItem {
  type: string;
  id?: string;
  role?: string;
  status?: string;
  content?: ResponseApiContentItem[];
}

export interface ResponseApiFullResponse {
  id: string;
  object: string;
  model: string;
  output: ResponseApiOutputItem[];
  stop_reason: string;
  status: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}
