import OpenAI from 'openai';

export type SimpleMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export interface GenerateTextOptions {
  input: string | SimpleMessage[];
  instructions?: string;
  temperature?: number;
  maxOutputTokens?: number;
  model?: string;
}

type JsonSchemaDef = {
  name?: string; // optional label (handy for debugging)
  schema: Record<string, any>;
};

export type GenerateJsonOptions = GenerateTextOptions & {
  schema: JsonSchemaDef;
};

export class OpenAIClient {
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel = 'gpt-5') {
    this.client = new OpenAI({ apiKey });
    this.defaultModel = defaultModel;
  }

  /**
   * Convert "simple messages" into Responses API input format.
   * Responses expects:
   * input: [
   *   { type: "message", role: "user", content: [{ type: "input_text", text: "..." }] }
   * ]
   */
  private normalizeInput(
    input: GenerateTextOptions['input']
  ): OpenAI.Responses.ResponseInput | string {
    if (typeof input === 'string') return input;

    return input.map((m) => ({
      type: 'message' as const,
      role: m.role,
      content: [{ type: 'input_text' as const, text: m.content }],
    }));
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
      input: this.normalizeInput(input),
      instructions,
      temperature,
      max_output_tokens: maxOutputTokens,
      // No need to set text.format here; default is plain text. :contentReference[oaicite:2]{index=2}
    });

    return typeof response.output_text === 'string' ? response.output_text : '';
  }

  /**
   * Strict JSON helper using Structured Outputs via `text.format`.
   * (Replaces the old `response_format` parameter.) :contentReference[oaicite:3]{index=3}
   */
  async generateJson<T = any>(options: GenerateJsonOptions): Promise<T> {
    const {
      input,
      instructions,
      temperature = 0.7,
      maxOutputTokens = 512,
      model,
      schema,
    } = options;

    const response = await this.client.responses.create({
      model: model ?? this.defaultModel,
      input: this.normalizeInput(input),
      instructions,
      temperature,
      max_output_tokens: maxOutputTokens,
      text: {
        format: {
          type: 'json_schema',
          strict: true,
          // `name` is optional; include if you want a label for logs/debugging.
          ...(schema.name ? { name: schema.name } : {}),
          schema: schema.schema,
        },
      },
    });

    const raw = (response.output_text ?? '').trim();
    if (!raw) {
      throw new Error(
        `OpenAI returned empty output_text while expecting JSON. response_id=${(response as any).id ?? 'unknown'}`
      );
    }

    try {
      return JSON.parse(raw) as T;
    } catch (err: any) {
      const preview = raw.length > 2000 ? raw.slice(0, 2000) + '…' : raw;
      console.error('Failed to parse JSON from model output_text:', preview);
      throw new Error(`Failed to parse JSON: ${err?.message ?? String(err)}`);
    }
  }
}
