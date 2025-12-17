import { OpenAIClient, SimpleMessage } from './openai_client';

export type ScriptIntent = 'opening' | 'followup' | 'closing';

export interface ScriptSegment {
  id: string;
  text: string;
  tone: 'calm' | 'warm' | 'reassuring';
  maxDurationSeconds: number;
}

export interface ScriptPayload {
  intent: ScriptIntent;
  segments: ScriptSegment[];
  notesForHumanSupervisor: string | null;
}

export interface UserProfile {
  id: string;
  name?: string;
  preferredName?: string;
  ageRange?: 'child' | 'adult' | 'senior';
  relationshipToCaller?: string;
  locale?: string;
}

export interface CallContext {
  userProfile: UserProfile;
  lastCheckInSummary?: string;
  riskLevel?: 'low' | 'medium' | 'high';
}

// ✅ Strict JSON Schema for Structured Outputs
const scriptPayloadSchema = {
  name: 'ScriptPayload',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      intent: { type: 'string', enum: ['opening', 'followup', 'closing'] },
      segments: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            text: { type: 'string' },
            tone: { type: 'string', enum: ['calm', 'warm', 'reassuring'] },
            maxDurationSeconds: { type: 'number' },
          },
          required: ['id', 'text', 'tone', 'maxDurationSeconds'],
        },
      },
      notesForHumanSupervisor: { type: ['string', 'null'] },
    },
    required: ['intent', 'segments', 'notesForHumanSupervisor'],
  },
};

export class ScriptGeneratorAgent {
  constructor(
    private openai: OpenAIClient,
    private systemInstructions: string = defaultSystemInstructions
  ) {}

  async generateOpeningScript(context: CallContext): Promise<ScriptPayload> {
    const { userProfile, lastCheckInSummary, riskLevel = 'low' } = context;

    const input: SimpleMessage[] = [
      { role: 'system', content: this.systemInstructions },
      {
        role: 'user',
        content: [
          `You are generating the OPENING of a reassurance/wellbeing call.`,
          ``,
          `User profile:`,
          `- Name (if given): ${userProfile.preferredName ?? userProfile.name ?? 'Unknown'}`,
          `- Age range: ${userProfile.ageRange ?? 'Unknown'}`,
          `- Relationship to caller: ${userProfile.relationshipToCaller ?? 'Unknown'}`,
          `- Locale: ${userProfile.locale ?? 'Unknown'}`,
          ``,
          `Last check-in summary (can be empty):`,
          `${lastCheckInSummary ?? 'No previous history available.'}`,
          ``,
          `Estimated current risk level: ${riskLevel}`,
          ``,
          `Task:`,
          `1) Greet the person warmly.`,
          `2) Remind them who is calling and why.`,
          `3) Briefly acknowledge any relevant past info (if provided).`,
          `4) Ask one gentle, open-ended question about how they are doing today.`,
          ``,
          `Constraints:`,
          `- Each segment must be 1–2 sentences.`,
          `- Simple language suitable for voice.`,
          `- No markup, no emojis.`,
          `- notesForHumanSupervisor can be null.`,
        ].join('\n'),
      },
    ];

    return this.openai.generateJson<ScriptPayload>({
      input,
      schema: scriptPayloadSchema,
      temperature: 0.6,
      maxOutputTokens: 350,
    });
  }

  async generateFollowupScript(params: {
    context: CallContext;
    lastUserUtterance: string;
    runningSummary?: string;
  }): Promise<ScriptPayload> {
    const { context, lastUserUtterance, runningSummary } = params;
    const { userProfile, riskLevel = 'low' } = context;

    const input: SimpleMessage[] = [
      { role: 'system', content: this.systemInstructions },
      {
        role: 'user',
        content: [
          `You are generating a FOLLOW-UP turn in an ongoing reassurance/wellbeing call.`,
          ``,
          `User profile:`,
          `- Name (if given): ${userProfile.preferredName ?? userProfile.name ?? 'Unknown'}`,
          `- Age range: ${userProfile.ageRange ?? 'Unknown'}`,
          `- Relationship to caller: ${userProfile.relationshipToCaller ?? 'Unknown'}`,
          `- Locale: ${userProfile.locale ?? 'Unknown'}`,
          ``,
          `Current call running summary (may be short or empty):`,
          `${runningSummary ?? 'No summary yet.'}`,
          ``,
          `Most recent user utterance (transcribed):`,
          `${lastUserUtterance}`,
          ``,
          `Estimated risk level for this user: ${riskLevel}`,
          ``,
          `Task:`,
          `1) Acknowledge what the user just said.`,
          `2) Respond empathically and validate feelings.`,
          `3) Ask one appropriate follow-up question (open-ended if possible).`,
          `4) If user sounds distressed or mentions safety issues, encourage reaching out to emergency services or a trusted contact (do NOT invent phone numbers).`,
          ``,
          `Constraints:`,
          `- Each segment must be 1–2 sentences.`,
          `- Simple language suitable for voice.`,
          `- No markup, no emojis.`,
          `- If subtle safety concerns exist, mention them in notesForHumanSupervisor.`,
        ].join('\n'),
      },
    ];

    return this.openai.generateJson<ScriptPayload>({
      input,
      schema: scriptPayloadSchema,
      temperature: 0.7,
      maxOutputTokens: 400,
    });
  }
}

const defaultSystemInstructions = `
You are an AI assistant that writes short, natural-sounding scripts
for voice-based reassurance / wellbeing phone calls.

General style:
- Warm, calm, reassuring.
- No slang, no sarcasm, no dark humor.
- Simple, clear language for all ages, including older adults.
- Keep sentences short so they are easy to understand over the phone.

Important safety constraints:
- Do NOT claim to be a doctor, therapist, or emergency service.
- Do NOT give medical or legal instructions.
- If the user appears to be in danger, encourage them to contact local
  emergency services or a trusted person, but do NOT invent specific phone numbers.
- Avoid making definitive diagnoses or promises.
`.trim();
