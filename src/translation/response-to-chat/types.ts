/**
 * Response API → Chat Completions translation types
 */

/**
 * A single output item in the Responses API response (simplified to text messages)
 */
export interface ResponseApiOutputItem {
  type: string;
  role?: string;
  content?: Array<{
    type: string;
    text?: string;
  }>;
}

/**
 * Responses API response body shape (fields relevant to translation)
 */
export interface ResponseApiResponse {
  id?: string;
  object?: string;
  model?: string;
  output?: ResponseApiOutputItem[];
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  [key: string]: unknown;
}

/**
 * A single Chat Completions choice
 */
export interface ChatCompletionsChoice {
  index: number;
  message: {
    role: string;
    content: string | null;
  };
  finish_reason: string | null;
}

/**
 * Chat Completions response body shape
 */
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

/**
 * Result returned by translateResponseApiToChatResponse
 */
export interface ResponseToChatTranslationResult {
  success: boolean;
  translated?: ChatCompletionsResponse;
  error?: string;
}
