import OpenAI from 'openai';

export type SimpleMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export interface GenerateTextOptions {
  input: string | SimpleMessage[];
  instructions?: string;

  /**
   * IMPORTANT: do not default this. Some models (e.g., gpt-5 reasoning)
   * reject temperature entirely if it is present. :contentReference[oaicite:1]{index=1}
   */
  temperature?: number;

  maxOutputTokens?: number;
  model?: string;
}

type JsonSchemaDef = {
  name?: string;
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
   * Reasoning model families (like gpt-5) do not support temperature/top_p/etc.
   * Keep this conservative; you can expand as you use more models. :contentReference[oaicite:2]{index=2}
   */
  private supportsTemperature(model: string): boolean {
    // gpt-5* (reasoning) -> no temperature
    if (model.startsWith('gpt-5')) return false;

    // Common reasoning families -> no temperature (optional but usually correct)
    // If you don't use these, you can remove them.
    if (model.startsWith('o1')) return false;
    if (model.startsWith('o3')) return false;
    if (model.startsWith('o4')) return false;

    return true;
  }

  async generateText(options: GenerateTextOptions): Promise<string> {
    const {
      input,
      instructions,
      temperature,
      maxOutputTokens = 512,
      model,
    } = options;

    const chosenModel = model ?? this.defaultModel;

    const req: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
      model: chosenModel,
      input: this.normalizeInput(input),
      instructions,
      max_output_tokens: maxOutputTokens,
    };

    // Only include temperature if explicitly provided AND model supports it.
    if (temperature !== undefined && this.supportsTemperature(chosenModel)) {
      (req as any).temperature = temperature;
    }

    const response = await this.client.responses.create(req);
    return typeof response.output_text === 'string' ? response.output_text : '';
  }

  async generateJson<T = any>(options: GenerateJsonOptions): Promise<T> {
    const {
      input,
      instructions,
      temperature,
      maxOutputTokens = 512,
      model,
      schema,
    } = options;

    const chosenModel = model ?? this.defaultModel;

    const req: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
      model: chosenModel,
      input: this.normalizeInput(input),
      instructions,
      max_output_tokens: maxOutputTokens,
      text: {
        format: {
          type: 'json_schema',
          strict: true,
          ...(schema.name ? { name: schema.name } : {}),
          schema: schema.schema,
        },
      },
    };

    // Only include temperature if explicitly provided AND model supports it.
    if (temperature !== undefined && this.supportsTemperature(chosenModel)) {
      (req as any).temperature = temperature;
    }

    const response = await this.client.responses.create(req);

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
