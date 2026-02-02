import { OpenAIClient, SimpleMessage } from './openai_client';

export type ScriptIntent = 'opening' | 'followup' | 'closing';

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
}

/**
 * ✅ Updated Strict JSON Schema for Structured Outputs
 * - HARD CAP: max 3 segments per response
 */
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
        maxItems: 3, // ✅ enforce 1–3 segments only
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
          `1) Greet the person warmly with a little variety (no clichés).`,
          `2) Remind them who is calling and why.`,
          `3) Briefly acknowledge any relevant past info (if provided).`,
          `4) Ask one gentle, open-ended question about how they are doing today.`,
          ``,
          `Emergency/Distress detection:`,
          `- Always populate handoffSignal.`,
          `- In opening scripts, set handoffSignal.level="none" unless the provided context strongly implies imminent danger.`,
          ``,
          `Response length rules (CRITICAL):`,
          `- Return ONLY 1–2 segments whenever possible.`,
          `- NEVER return more than 3 segments.`,
          `- Each segment must be 1–2 sentences.`,
          ``,
          `Voice constraints:`,
          `- Simple language suitable for voice.`,
          `- No markup, no emojis.`,
          `- notesForHumanSupervisor can be null.`,
        ].join('\n'),
      },
    ];

    return this.openai.generateJson<ScriptPayload>({
      input,
      schema: scriptPayloadSchema,
      temperature: 0.7,
      maxOutputTokens: 380,
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
          `1) Acknowledge what the user just said (use varied phrasing; do not repeat the same opener every time).`,
          `2) Respond empathically and validate feelings.`,
          `3) Ask one appropriate follow-up question (open-ended if possible).`,
          `4) If user sounds distressed or mentions safety issues, encourage reaching out to emergency services or a trusted contact (do NOT invent phone numbers).`,
          ``,
          `Emergency/Distress detection (CRITICAL):`,
          `- Always populate handoffSignal.`,
          `- Set handoffSignal.level based on the user's utterance and summary:`,
          `  - "none": normal, no notable distress.`,
          `  - "monitor": mild distress but no safety threat.`,
          `  - "handoff": strong distress or credible safety concern.`,
          `  - "emergency": imminent danger.`,
          `- detected must be true if level != "none".`,
          `- reasons: 1–4 short phrases, factual and conservative.`,
          `- userQuotedTriggers: 0–3 short direct excerpts from lastUserUtterance.`,
          `- recommendedNextStep mapping:`,
          `  - none -> "continue_script"`,
          `  - monitor -> "offer_trusted_contact"`,
          `  - handoff -> "handoff_to_human"`,
          `  - emergency -> "suggest_emergency_services"`,
          `- If level is "handoff" or "emergency", also include a clear note in notesForHumanSupervisor.`,
          ``,
          `Response length rules (CRITICAL):`,
          `- Return ONLY 1–2 segments whenever possible.`,
          `- NEVER return more than 3 segments.`,
          `- Each segment must be 1–2 sentences.`,
          ``,
          `Voice constraints:`,
          `- Simple language suitable for voice.`,
          `- No markup, no emojis.`,
        ].join('\n'),
      },
    ];

    return this.openai.generateJson<ScriptPayload>({
      input,
      schema: scriptPayloadSchema,
      temperature: 0.8, // a bit more variety
      maxOutputTokens: 420,
    });
  }

  async generateClosingScript(params: {
    context: CallContext;
    runningSummary?: string;
  }): Promise<ScriptPayload> {
    const { context, runningSummary } = params;
    const { userProfile, riskLevel = 'low' } = context;

    const input: SimpleMessage[] = [
      { role: 'system', content: this.systemInstructions },
      {
        role: 'user',
        content: [
          `You are generating the CLOSING of a reassurance/wellbeing call.`,
          ``,
          `User profile:`,
          `- Name (if given): ${userProfile.preferredName ?? userProfile.name ?? 'Unknown'}`,
          `- Age range: ${userProfile.ageRange ?? 'Unknown'}`,
          `- Relationship to caller: ${userProfile.relationshipToCaller ?? 'Unknown'}`,
          `- Locale: ${userProfile.locale ?? 'Unknown'}`,
          ``,
          `Call summary so far:`,
          `${runningSummary ?? 'No summary.'}`,
          ``,
          `Estimated risk level: ${riskLevel}`,
          ``,
          `Task:`,
          `1) Close warmly and respectfully.`,
          `2) Offer one small supportive line (brief).`,
          `3) Invite them to reach out to a trusted person if they need support.`,
          `4) End with a clear goodbye.`,
          ``,
          `Emergency/Distress detection:`,
          `- Always populate handoffSignal.`,
          `- If the summary implies imminent danger, set level accordingly; otherwise "none".`,
          ``,
          `Response length rules (CRITICAL):`,
          `- Return 1 segment (preferred) or at most 2 segments.`,
          `- NEVER more than 3 segments.`,
          `- Each segment 1–2 sentences.`,
          ``,
          `Voice constraints:`,
          `- Simple language, natural voice.`,
          `- No markup, no emojis.`,
          `- notesForHumanSupervisor can be null unless handoff/emergency.`,
        ].join('\n'),
      },
    ];

    return this.openai.generateJson<ScriptPayload>({
      input,
      schema: scriptPayloadSchema,
      temperature: 0.7,
      maxOutputTokens: 260,
    });
  }
}

const defaultSystemInstructions = `
You are an AI assistant that writes short, natural-sounding scripts
for voice-based reassurance / wellbeing phone calls.

General style:
- Warm, calm, reassuring.
- Simple, clear language for all ages, including older adults.
- Keep sentences short so they are easy to understand over the phone.
- Add gentle variety in wording so the call does not sound repetitive.
  Examples: vary acknowledgements ("I hear you", "That sounds heavy", "Thanks for telling me"),
  vary greetings, and avoid using the same phrase every turn.
- No slang, no sarcasm, no dark humor, no cheesy clichés.

Important safety constraints:
- Do NOT claim to be a doctor, therapist, or emergency service.
- Do NOT give medical or legal instructions.
- If the user appears to be in danger, encourage them to contact local
  emergency services or a trusted person, but do NOT invent specific phone numbers.
- Avoid making definitive diagnoses or promises.

Emergency/Distress signaling:
- You MUST always return a handoffSignal object in the JSON.
- Be conservative: do not mark emergency unless there is imminent danger.
- If emergency, the script should explicitly encourage contacting local emergency services
  or someone nearby immediately.
`.trim();
