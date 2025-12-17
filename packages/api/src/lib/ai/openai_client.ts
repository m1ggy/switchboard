import OpenAI from 'openai';

export type SimpleMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export interface GenerateTextOptions {
  /**
   * You can pass either a plain string OR a simple chat-style array.
   * We'll normalize it to the Responses API format.
   */
  input: string | SimpleMessage[];
  instructions?: string;
  temperature?: number;
  maxOutputTokens?: number;
  model?: string;
}

type JsonSchemaDef = {
  name: string;
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
   *
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
    });

    const text = (response as any).output_text ?? '';
    return typeof text === 'string' ? text : '';
  }

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
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: schema.name,
          strict: true,
          schema: schema.schema,
        },
      },
    });

    const raw = ((response as any).output_text ?? '').trim();

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
      throw new Error(
        `Failed to parse JSON from model output_text: ${err?.message ?? String(err)}`
      );
    }
  }
}
