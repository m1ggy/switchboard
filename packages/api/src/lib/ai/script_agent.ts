import { OpenAIClient, SimpleMessage } from './openai_client';

export type ScriptIntent =
  | 'opening'
  | 'followup'
  | 'closing'
  | 'medication_reminder';

export type CallMode = 'reassurance' | 'medication_reminder';

export interface ScriptSegment {
  id: string;
  text: string;
  tone: 'calm' | 'warm' | 'reassuring';
  maxDurationSeconds: number;
}

export type HandoffLevel = 'none' | 'monitor' | 'handoff' | 'emergency';

export interface HandoffSignal {
  level: HandoffLevel;
  detected: boolean;
  reasons: string[];
  userQuotedTriggers: string[];
  recommendedNextStep:
    | 'continue_script'
    | 'offer_trusted_contact'
    | 'suggest_emergency_services'
    | 'handoff_to_human';
}

export interface ScriptPayload {
  intent: ScriptIntent;
  segments: ScriptSegment[];
  notesForHumanSupervisor: string | null;
  handoffSignal: HandoffSignal;
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

  // ✅ single switch
  callMode: CallMode;
}

/**
 * Strict JSON schema (unchanged except intent enum)
 */
const scriptPayloadSchema = {
  name: 'ScriptPayload',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      intent: {
        type: 'string',
        enum: ['opening', 'followup', 'closing', 'medication_reminder'],
      },
      segments: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
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
      handoffSignal: {
        type: 'object',
        additionalProperties: false,
        properties: {
          level: {
            type: 'string',
            enum: ['none', 'monitor', 'handoff', 'emergency'],
          },
          detected: { type: 'boolean' },
          reasons: { type: 'array', items: { type: 'string' } },
          userQuotedTriggers: { type: 'array', items: { type: 'string' } },
          recommendedNextStep: {
            type: 'string',
            enum: [
              'continue_script',
              'offer_trusted_contact',
              'suggest_emergency_services',
              'handoff_to_human',
            ],
          },
        },
        required: [
          'level',
          'detected',
          'reasons',
          'userQuotedTriggers',
          'recommendedNextStep',
        ],
      },
    },
    required: [
      'intent',
      'segments',
      'notesForHumanSupervisor',
      'handoffSignal',
    ],
  },
};

export class ScriptGeneratorAgent {
  constructor(
    private openai: OpenAIClient,
    private systemInstructions: string = defaultSystemInstructions
  ) {}

  // ---------------- OPENING ----------------
  async generateOpeningScript(context: CallContext): Promise<ScriptPayload> {
    const { userProfile, riskLevel = 'low', callMode } = context;

    const calleeName = userProfile.preferredName ?? userProfile.name ?? 'there';

    const input: SimpleMessage[] = [
      { role: 'system', content: this.systemInstructions },
      {
        role: 'user',
        content: [
          `You are generating the OPENING of a voice call.`,
          ``,
          `Call mode: ${callMode}`,
          ``,
          `Hard requirements (must follow):`,
          `- The FIRST sentence must be a warm greeting that includes the callee's name: "${calleeName}".`,
          `- In the FIRST segment, explicitly mention the purpose of the call.`,
          `- Keep it natural for a phone call.`,
          ``,
          `If callMode="medication_reminder":`,
          `- intent MUST be "medication_reminder".`,
          `- Purpose must be "a quick medication reminder".`,
          `- Remind the person to take their medication.`,
          `- Ask if they have taken it or will take it now.`,
          `- Do NOT give dosing instructions.`,
          ``,
          `User name (callee): ${calleeName}`,
          `Locale: ${userProfile.locale ?? 'Unknown'}`,
          `Risk level: ${riskLevel}`,
          ``,
          `Emergency rules:`,
          `- Always populate handoffSignal.`,
          `- Default to level="none" unless there is imminent danger.`,
          ``,
          `Response rules:`,
          `- 1–2 short segments.`,
          `- Simple spoken language.`,
          `- No emojis.`,
        ].join('\n'),
      },
    ];

    return this.openai.generateJson<ScriptPayload>({
      input,
      schema: scriptPayloadSchema,
      temperature: 0.6,
      maxOutputTokens: 220,
    });
  }

  // ---------------- FOLLOW-UP ----------------
  async generateFollowupScript(params: {
    context: CallContext;
    lastUserUtterance: string;
  }): Promise<ScriptPayload> {
    const { context, lastUserUtterance } = params;
    const { userProfile, callMode, riskLevel = 'low' } = context;

    const input: SimpleMessage[] = [
      { role: 'system', content: this.systemInstructions },
      {
        role: 'user',
        content: [
          `You are generating the NEXT assistant turn in a voice call.`,
          ``,
          `Call mode: ${callMode}`,
          ``,
          `Rules:`,
          `- intent MUST be "medication_reminder".`,
          `- Briefly acknowledge what the user said.`,
          `- If they have not taken their medication, remind them again.`,
          `- Ask ONE simple confirmation question.`,
          `- Do NOT give medical advice.`,
          ``,
          `User said:`,
          lastUserUtterance,
          ``,
          `Risk level: ${riskLevel}`,
          ``,
          `Emergency rules:`,
          `- Always return handoffSignal.`,
          `- Be conservative.`,
          ``,
          `Response rules:`,
          `- 1 short segment preferred.`,
          `- Never more than 2 segments.`,
        ].join('\n'),
      },
    ];

    return this.openai.generateJson<ScriptPayload>({
      input,
      schema: scriptPayloadSchema,
      temperature: 0.6,
      maxOutputTokens: 200,
    });
  }

  // ---------------- CLOSING ----------------
  async generateClosingScript(params: {
    context: CallContext;
    runningSummary?: string;
  }): Promise<ScriptPayload> {
    const { context, runningSummary } = params;
    const { userProfile, callMode, riskLevel = 'low' } = context;

    const input: SimpleMessage[] = [
      { role: 'system', content: this.systemInstructions },
      {
        role: 'user',
        content: [
          `You are generating the CLOSING of a voice call.`,
          ``,
          `Call mode: ${callMode}`,
          ``,
          `Rules:`,
          `- intent MUST be "medication_reminder" if callMode="medication_reminder".`,
          `- Keep it brief and polite.`,
          ``,
          `User name: ${userProfile.preferredName ?? 'there'}`,
          `Risk level: ${riskLevel}`,
          ``,
          `Call summary so far (may be empty):`,
          `${runningSummary ?? 'No summary.'}`,
          ``,
          `Emergency rules:`,
          `- Always populate handoffSignal.`,
          `- Default to level="none" unless imminent danger is implied.`,
          ``,
          `Response rules:`,
          `- 1 short segment.`,
          `- Simple, calm voice.`,
        ].join('\n'),
      },
    ];

    return this.openai.generateJson<ScriptPayload>({
      input,
      schema: scriptPayloadSchema,
      temperature: 0.5,
      maxOutputTokens: 120,
    });
  }
}

const defaultSystemInstructions = `
You are an AI assistant that makes short, calm, voice-based phone calls.

Style:
- Warm, polite, simple.
- Short sentences suitable for phone audio.
- No emojis, no markup.

Medication reminder rules:
- Only remind the person to take their medication.
- Do NOT give dosing instructions.
- Do NOT give medical advice.
- Ask for confirmation in simple terms.

Safety:
- Always return a handoffSignal.
- Encourage emergency services only if there is imminent danger.
`.trim();
