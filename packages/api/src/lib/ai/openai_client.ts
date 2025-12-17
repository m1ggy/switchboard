import OpenAI from 'openai';

export type SimpleMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export interface GenerateTextOptions {
  input: string | SimpleMessage[];
  instructions?: string;

  // IMPORTANT: some models reject temperature if present; only send when supported
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

  constructor(apiKey: string, defaultModel = 'gpt-4o-mini-2024-07-18') {
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

  private supportsTemperature(model: string): boolean {
    if (model.startsWith('gpt-5')) return false;
    if (model.startsWith('o1')) return false;
    if (model.startsWith('o3')) return false;
    if (model.startsWith('o4')) return false;
    return true;
  }

  /**
   * Extract concatenated output_text from the response.output array
   * (not just response.output_text convenience field). :contentReference[oaicite:2]{index=2}
   */
  private extractOutputTextFromItems(response: any): string {
    const out: string[] = [];
    for (const item of response?.output ?? []) {
      for (const c of item?.content ?? []) {
        if (c?.type === 'output_text' && typeof c.text === 'string')
          out.push(c.text);
      }
    }
    return out.join('').trim();
  }

  /**
   * Extract structured JSON from the response.output array if present.
   * Some responses may have output_json (already parsed) instead of output_text.
   */
  private extractOutputJsonFromItems(response: any): unknown | undefined {
    for (const item of response?.output ?? []) {
      for (const c of item?.content ?? []) {
        if (c?.type === 'output_json' && c.json !== undefined) return c.json;
      }
    }
    return undefined;
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

    if (temperature !== undefined && this.supportsTemperature(chosenModel)) {
      (req as any).temperature = temperature;
    }

    const response = await this.client.responses.create(req);

    // Prefer SDK convenience if present, but fall back to walking response.output :contentReference[oaicite:3]{index=3}
    const t0 =
      typeof (response as any).output_text === 'string'
        ? (response as any).output_text
        : '';
    return t0?.trim?.() || this.extractOutputTextFromItems(response);
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
        // Structured Outputs via Responses API uses text.format :contentReference[oaicite:4]{index=4}
        format: {
          type: 'json_schema',
          strict: true,
          ...(schema.name ? { name: schema.name } : {}),
          schema: schema.schema,
        },
      },
    };

    if (temperature !== undefined && this.supportsTemperature(chosenModel)) {
      (req as any).temperature = temperature;
    }

    const response = await this.client.responses.create(req);

    // 1) Best case: output_json exists (already parsed)
    const j = this.extractOutputJsonFromItems(response);
    if (j !== undefined) return j as T;

    // 2) Next: output_text exists somewhere in output items (may be empty in response.output_text)
    const raw =
      (typeof (response as any).output_text === 'string'
        ? (response as any).output_text
        : ''
      ).trim() || this.extractOutputTextFromItems(response);

    if (!raw) {
      // Don’t lie: genuinely nothing usable came back
      throw new Error(
        `OpenAI response contained no output_text or output_json items. response_id=${(response as any).id ?? 'unknown'}`
      );
    }

    try {
      return JSON.parse(raw) as T;
    } catch (err: any) {
      const preview = raw.length > 2000 ? raw.slice(0, 2000) + '…' : raw;
      console.error('Failed to parse JSON from model output:', preview);
      throw new Error(`Failed to parse JSON: ${err?.message ?? String(err)}`);
    }
  }
}
