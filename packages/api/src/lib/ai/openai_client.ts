import OpenAI from "openai";

export interface GenerateTextOptions {
  input: string | { role: string; content: string }[];
  instructions?: string;
  temperature?: number;
  maxOutputTokens?: number;
  model?: string;
}

/**
 * Thin wrapper around the OpenAI Responses API.
 * Docs: https://platform.openai.com/docs/guides/text
 */
export class OpenAIClient {
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel = "gpt-5") {
    this.client = new OpenAI({
      apiKey,
    });
    this.defaultModel = defaultModel;
  }

  /**
   * Basic text generation helper.
   * Returns a single string (concatenated output_text).
   */
  async generateText(options: GenerateTextOptions): Promise<string> {
    const {
      input,
      instructions,
      temperature = 0.7,
      maxOutputTokens = 512,
      model,
    } = options;

    const response = await this.client.responses.create({
      model: model ?? this.defaultModel,
      input,
      instructions,
      temperature,
      max_output_tokens: maxOutputTokens,
    });

    // Responses API exposes a convenience string:
    // https://platform.openai.com/docs/guides/text
    return response.output_text ?? "";
  }

  /**
   * Helper for “JSON-shaped” responses.
   * The prompt must clearly say: "Return ONLY valid JSON with this shape: …"
   */
  async generateJson<T = any>(
    options: GenerateTextOptions
  ): Promise<T> {
    const text = await this.generateText(options);

    try {
      return JSON.parse(text) as T;
    } catch (err) {
      console.error("Failed to parse JSON from model:", text);
      throw err;
    }
  }
}
