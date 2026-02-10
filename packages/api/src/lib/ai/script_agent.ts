// src/lib/ai/script_agent.ts
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

  // ✅ NEW: brand + callback
  companyName?: string; // e.g. "Acme Health"
  callbackNumber?: string; // e.g. "+1 (415) 555-1212"
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

// ✅ helper: ensures consistent “recite digits”
function toSpokenDigits(phone: string | undefined | null): string {
  const raw = (phone ?? '').trim();
  if (!raw) return '';

  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';

  const spaced = digits.split('').join(' ');
  return hasPlus ? `plus ${spaced}` : spaced;
}

export class ScriptGeneratorAgent {
  constructor(
    private openai: OpenAIClient,
    private systemInstructions: string = defaultSystemInstructions
  ) {}

  // ---------------- OPENING ----------------
  async generateOpeningScript(context: CallContext): Promise<ScriptPayload> {
    const { userProfile, riskLevel = 'low', callMode } = context;

    const calleeName = userProfile.preferredName ?? userProfile.name ?? 'there';
    const companyName = context.companyName ?? 'our team';

    const expectedIntent: ScriptIntent =
      callMode === 'medication_reminder' ? 'medication_reminder' : 'opening';

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
          `- intent MUST be "${expectedIntent}".`,
          `- The FIRST sentence must be a warm greeting that includes the callee's name: "${calleeName}".`,
          `- The FIRST sentence must also include the company name: "${companyName}".`,
          `- In the FIRST segment, explicitly mention the purpose of the call.`,
          `- Keep it natural for a phone call.`,
          ``,
          `If callMode="medication_reminder":`,
          `- Purpose must be "a quick medication reminder".`,
          `- Remind the person to take their medication.`,
          `- Ask if they have taken it or will take it now.`,
          `- Do NOT give dosing instructions.`,
          ``,
          `If callMode="reassurance":`,
          `- Purpose must be "a quick reassurance check-in".`,
          ``,
          `Company name: ${companyName}`,
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
      maxOutputTokens: 240,
    });
  }

  // ---------------- FOLLOW-UP ----------------
  async generateFollowupScript(params: {
    context: CallContext;
    lastUserUtterance: string;
    runningSummary?: string; // ✅ allow existing caller signature; not required
  }): Promise<ScriptPayload> {
    const { context, lastUserUtterance } = params;
    const { callMode, riskLevel = 'low' } = context;

    const expectedIntent: ScriptIntent =
      callMode === 'medication_reminder' ? 'medication_reminder' : 'followup';

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
          `- intent MUST be "${expectedIntent}".`,
          `- Briefly acknowledge what the user said.`,
          ``,
          `If callMode="medication_reminder":`,
          `- If the user already confirmed they took it, thank them and do NOT ask again.`,
          `- If they have not taken it, gently remind once, then prepare to end the call.`,
          `- Do NOT give medical advice.`,
          ``,
          `If callMode="reassurance":`,
          `- Ask a short, supportive follow-up question.`,
          `- Keep it calm and practical.`,
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
      maxOutputTokens: 220,
    });
  }

  // ---------------- CLOSING ----------------
  async generateClosingScript(params: {
    context: CallContext;
    runningSummary?: string;
  }): Promise<ScriptPayload> {
    const { context, runningSummary } = params;
    const { userProfile, callMode, riskLevel = 'low' } = context;

    const expectedIntent: ScriptIntent =
      callMode === 'medication_reminder' ? 'medication_reminder' : 'closing';

    const companyName = context.companyName ?? 'our team';
    const callbackNumber = context.callbackNumber ?? '';
    const callbackSpokenDigits = toSpokenDigits(callbackNumber);

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
          `- intent MUST be "${expectedIntent}".`,
          `- Keep it brief and polite.`,
          `- Before ending, ask the callee if they need anything else at all.`,
          `- If a callbackNumber is provided, tell them to call it and recite it as spoken digits.`,
          `- If callbackSpokenDigits is empty, do NOT invent a number; omit the callback instruction.`,
          ``,
          `Company name: ${companyName}`,
          `Callback number (raw): ${callbackNumber || '(none)'}`,
          `Callback number (spoken digits, must be verbatim if used): ${callbackSpokenDigits || '(none)'}`,
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
          `- No emojis.`,
        ].join('\n'),
      },
    ];

    return this.openai.generateJson<ScriptPayload>({
      input,
      schema: scriptPayloadSchema,
      temperature: 0.5,
      maxOutputTokens: 170,
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
