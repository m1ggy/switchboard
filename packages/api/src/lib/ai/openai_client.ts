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

  // ✅ NEW: reduce "thinking" latency when supported
  reasoningEffort?: 'low' | 'medium' | 'high';

  // ✅ NEW: fail fast instead of hanging
  timeoutMs?: number;
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

  // ✅ Some models accept reasoning.effort; safe-gate it to avoid API errors
  private supportsReasoningEffort(model: string): boolean {
    // Conservative: only enable for o*-style reasoning models and future gpt-5 families if needed.
    // For gpt-4o-mini this is typically ignored/unsupported, so keep false.
    if (model.startsWith('o1')) return true;
    if (model.startsWith('o3')) return true;
    if (model.startsWith('o4')) return true;
    if (model.startsWith('gpt-5')) return true;
    return false;
  }

  private extractOutputTextFromItems(response: any): string {
    const out: string[] = [];
    for (const item of response?.output ?? []) {
      for (const c of item?.content ?? []) {
        if (c?.type === 'output_text' && typeof c.text === 'string') {
          out.push(c.text);
        }
      }
    }
    return out.join('').trim();
  }

  private extractOutputJsonFromItems(response: any): unknown | undefined {
    for (const item of response?.output ?? []) {
      for (const c of item?.content ?? []) {
        if (c?.type === 'output_json' && c.json !== undefined) return c.json;
      }
    }
    return undefined;
  }

  private async createWithTimeout<T>(
    fn: (signal?: AbortSignal) => Promise<T>,
    timeoutMs?: number
  ): Promise<T> {
    if (!timeoutMs || timeoutMs <= 0) return fn(undefined);

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);

    try {
      return await fn(ac.signal);
    } finally {
      clearTimeout(t);
    }
  }

  async generateText(options: GenerateTextOptions): Promise<string> {
    const {
      input,
      instructions,
      temperature,
      maxOutputTokens = 256, // ✅ lower default
      model,
      reasoningEffort,
      timeoutMs,
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

    if (reasoningEffort && this.supportsReasoningEffort(chosenModel)) {
      (req as any).reasoning = { effort: reasoningEffort };
    }

    const response = await this.createWithTimeout(
      (signal) => this.client.responses.create({ ...req, signal } as any),
      timeoutMs
    );

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
      maxOutputTokens = 280, // ✅ lower default for voice JSON
      model,
      schema,
      reasoningEffort,
      timeoutMs,
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

    if (temperature !== undefined && this.supportsTemperature(chosenModel)) {
      (req as any).temperature = temperature;
    }

    if (reasoningEffort && this.supportsReasoningEffort(chosenModel)) {
      (req as any).reasoning = { effort: reasoningEffort };
    }

    const response = await this.createWithTimeout(
      (signal) => this.client.responses.create({ ...req, signal } as any),
      timeoutMs
    );

    const j = this.extractOutputJsonFromItems(response);
    if (j !== undefined) return j as T;

    const raw =
      (typeof (response as any).output_text === 'string'
        ? (response as any).output_text
        : ''
      ).trim() || this.extractOutputTextFromItems(response);

    if (!raw) {
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
