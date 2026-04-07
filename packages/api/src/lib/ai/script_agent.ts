// src/lib/ai/script_agent.ts
import { OpenAIClient, SimpleMessage } from './openai_client';

export type ScriptIntent =
  | 'opening'
  | 'followup'
  | 'closing'
  | 'medication_reminder'
  | 'appointment_reminder';

export type CallMode =
  | 'reassurance'
  | 'medication_reminder'
  | 'appointment_reminder';

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

export interface AppointmentReminderContext {
  appointment_title?: string;
  appointment_datetime?: string;
  appointment_timezone?: string;
  provider_name?: string;
  provider_phone?: string;
  location_name?: string;
  location_address?: string;
  notes?: string;
  requires_confirmation?: boolean;
}

export interface CallContext {
  userProfile: UserProfile;
  lastCheckInSummary?: string;
  riskLevel?: 'low' | 'medium' | 'high';

  callMode: CallMode;

  companyName?: string;
  callbackNumber?: string;

  appointmentDetails?: AppointmentReminderContext;
}

/**
 * Strict JSON schema
 */
const scriptPayloadSchema = {
  name: 'ScriptPayload',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      intent: {
        type: 'string',
        enum: [
          'opening',
          'followup',
          'closing',
          'medication_reminder',
          'appointment_reminder',
        ],
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

function toSpokenDigits(phone: string | undefined | null): string {
  const raw = (phone ?? '').trim();
  if (!raw) return '';

  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';

  const spaced = digits.split('').join(' ');
  return hasPlus ? `plus ${spaced}` : spaced;
}

function safeLine(label: string, value: unknown): string {
  const text =
    value === null || value === undefined || value === ''
      ? '(none)'
      : String(value);
  return `${label}: ${text}`;
}

export class ScriptGeneratorAgent {
  constructor(
    private openai: OpenAIClient,
    private systemInstructions: string = defaultSystemInstructions
  ) {}

  // ---------------- OPENING ----------------
  async generateOpeningScript(context: CallContext): Promise<ScriptPayload> {
    const {
      userProfile,
      riskLevel = 'low',
      callMode,
      appointmentDetails,
    } = context;

    const calleeName = userProfile.preferredName ?? userProfile.name ?? 'there';
    const companyName = context.companyName ?? 'our team';

    const expectedIntent: ScriptIntent =
      callMode === 'medication_reminder'
        ? 'medication_reminder'
        : callMode === 'appointment_reminder'
          ? 'appointment_reminder'
          : 'opening';

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
          `If callMode="appointment_reminder":`,
          `- Purpose must be "a quick appointment reminder".`,
          `- Mention they have an upcoming appointment.`,
          `- If appointment details are provided in context, use them naturally and briefly.`,
          `- Prefer mentioning appointment title and provider name if available.`,
          `- Mention date/time only if provided in context and keep it short.`,
          `- Ask them to confirm if they can make it, or if they need to reschedule.`,
          `- Do NOT invent appointment details.`,
          `- Do NOT include overly sensitive medical detail.`,
          ``,
          `If callMode="reassurance":`,
          `- Purpose must be "a quick reassurance check-in".`,
          ``,
          safeLine(`Company name`, companyName),
          safeLine(`User name (callee)`, calleeName),
          safeLine(`Locale`, userProfile.locale ?? 'Unknown'),
          safeLine(`Risk level`, riskLevel),
          ``,
          `Appointment details (only relevant when callMode="appointment_reminder"):`,
          safeLine(`appointment_title`, appointmentDetails?.appointment_title),
          safeLine(
            `appointment_datetime`,
            appointmentDetails?.appointment_datetime
          ),
          safeLine(
            `appointment_timezone`,
            appointmentDetails?.appointment_timezone
          ),
          safeLine(`provider_name`, appointmentDetails?.provider_name),
          safeLine(`provider_phone`, appointmentDetails?.provider_phone),
          safeLine(`location_name`, appointmentDetails?.location_name),
          safeLine(`location_address`, appointmentDetails?.location_address),
          safeLine(
            `requires_confirmation`,
            appointmentDetails?.requires_confirmation
          ),
          ``,
          `Emergency rules:`,
          `- Always populate handoffSignal.`,
          `- Default to level="none" unless there is imminent danger.`,
          ``,
          `Response rules:`,
          `- 1–2 short segments.`,
          `- Simple spoken language.`,
          `- No emojis.`,
          `- No bullet points.`,
        ].join('\n'),
      },
    ];

    return this.openai.generateJson<ScriptPayload>({
      input,
      schema: scriptPayloadSchema,
      temperature: 0.6,
      maxOutputTokens: 260,
    });
  }

  // ---------------- FOLLOW-UP ----------------
  async generateFollowupScript(params: {
    context: CallContext;
    lastUserUtterance: string;
    runningSummary?: string;
  }): Promise<ScriptPayload> {
    const { context, lastUserUtterance, runningSummary } = params;
    const { callMode, riskLevel = 'low', appointmentDetails } = context;

    const expectedIntent: ScriptIntent =
      callMode === 'medication_reminder'
        ? 'medication_reminder'
        : callMode === 'appointment_reminder'
          ? 'appointment_reminder'
          : 'followup';

    const callbackNumber = context.callbackNumber ?? '';
    const callbackSpokenDigits = toSpokenDigits(callbackNumber);

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
          `If callMode="appointment_reminder":`,
          `- If the user confirms, thank them and prepare to end the call.`,
          `- If they need to reschedule or cancel, acknowledge that and direct them to call back if a callback number is available.`,
          `- If callbackSpokenDigits exists, use it exactly as provided if you mention the number.`,
          `- Keep it very brief; do NOT ask many questions.`,
          `- Do NOT invent appointment details.`,
          ``,
          `If callMode="reassurance":`,
          `- Ask a short, supportive follow-up question.`,
          `- Keep it calm and practical.`,
          ``,
          `User said:`,
          lastUserUtterance,
          ``,
          safeLine(`Risk level`, riskLevel),
          safeLine(`Callback number (raw)`, callbackNumber || '(none)'),
          safeLine(
            `Callback number (spoken digits)`,
            callbackSpokenDigits || '(none)'
          ),
          ``,
          `Appointment details (only relevant when callMode="appointment_reminder"):`,
          safeLine(`appointment_title`, appointmentDetails?.appointment_title),
          safeLine(
            `appointment_datetime`,
            appointmentDetails?.appointment_datetime
          ),
          safeLine(
            `appointment_timezone`,
            appointmentDetails?.appointment_timezone
          ),
          safeLine(`provider_name`, appointmentDetails?.provider_name),
          safeLine(`location_name`, appointmentDetails?.location_name),
          ``,
          `Running summary so far (may be empty):`,
          runningSummary ?? 'No summary.',
          ``,
          `Emergency rules:`,
          `- Always return handoffSignal.`,
          `- Be conservative.`,
          ``,
          `Response rules:`,
          `- 1 short segment preferred.`,
          `- Never more than 2 segments.`,
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

  // ---------------- CLOSING ----------------
  async generateClosingScript(params: {
    context: CallContext;
    runningSummary?: string;
  }): Promise<ScriptPayload> {
    const { context, runningSummary } = params;
    const {
      userProfile,
      callMode,
      riskLevel = 'low',
      appointmentDetails,
    } = context;

    const expectedIntent: ScriptIntent =
      callMode === 'medication_reminder'
        ? 'medication_reminder'
        : callMode === 'appointment_reminder'
          ? 'appointment_reminder'
          : 'closing';

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
          `- For appointment reminder closings, do not restate a long list of appointment details.`,
          ``,
          safeLine(`Company name`, companyName),
          safeLine(`Callback number (raw)`, callbackNumber || '(none)'),
          safeLine(
            `Callback number (spoken digits, must be verbatim if used)`,
            callbackSpokenDigits || '(none)'
          ),
          ``,
          safeLine(`User name`, userProfile.preferredName ?? 'there'),
          safeLine(`Risk level`, riskLevel),
          ``,
          `Appointment details (only relevant when callMode="appointment_reminder"):`,
          safeLine(`appointment_title`, appointmentDetails?.appointment_title),
          safeLine(`provider_name`, appointmentDetails?.provider_name),
          safeLine(
            `appointment_datetime`,
            appointmentDetails?.appointment_datetime
          ),
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
      maxOutputTokens: 190,
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

Appointment reminder rules:
- Remind the person about an upcoming appointment.
- If appointment details are provided in context, you may briefly mention the appointment title, provider name, or time.
- Do NOT invent appointment details.
- Do NOT include overly sensitive medical detail.
- Ask if they can confirm attendance or need to reschedule.
- If rescheduling is needed, direct them to call back if callbackNumber exists.
- Keep it short and end the call after a single exchange.

Safety:
- Always return a handoffSignal.
- Encourage emergency services only if there is imminent danger.
`.trim();
