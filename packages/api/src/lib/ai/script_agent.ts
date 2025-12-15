import { OpenAIClient } from './openai_client';

export type ScriptIntent = 'opening' | 'followup' | 'closing';

export interface ScriptSegment {
  id: string;
  text: string; // what you send to ElevenLabs
  tone: 'calm' | 'warm' | 'reassuring';
  maxDurationSeconds: number; // hint for how long this segment should be
}

export interface ScriptPayload {
  intent: ScriptIntent;
  segments: ScriptSegment[];
  notesForHumanSupervisor?: string;
}

export interface UserProfile {
  id: string;
  name?: string;
  preferredName?: string;
  ageRange?: 'child' | 'adult' | 'senior';
  relationshipToCaller?: string; // e.g., "care agency", "clinic", "friend"
  locale?: string; // "en-US", "en-GB", etc.
}

export interface CallContext {
  userProfile: UserProfile;
  lastCheckInSummary?: string; // short text summary from previous call
  riskLevel?: 'low' | 'medium' | 'high';
}

export class ScriptGeneratorAgent {
  constructor(
    private openai: OpenAIClient,
    private systemInstructions: string = defaultSystemInstructions
  ) {}

  /**
   * Generate the **opening script** for a reassurance call.
   * Use this at the start of each call.
   */
  async generateOpeningScript(context: CallContext): Promise<ScriptPayload> {
    const { userProfile, lastCheckInSummary, riskLevel = 'low' } = context;

    const input = [
      {
        role: 'system',
        content: this.systemInstructions,
      },
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
          `1. Greet the person warmly.`,
          `2. Remind them who is calling and why.`,
          `3. Briefly acknowledge any relevant past info (if provided).`,
          `4. Ask one gentle, open-ended question about how they are doing today.`,
          ``,
          `Output requirements:`,
          `- Return ONLY valid JSON.`,
          `- Shape: { "intent": "opening", "segments": [ ... ], "notesForHumanSupervisor": string | null }.`,
          `- Each segment MUST be short (1–2 sentences max).`,
          `- Use clear, simple language suitable for voice.`,
          `- Do not include any markup, no quotes around the whole script, no emojis.`,
        ].join('\n'),
      },
    ];

    return this.openai.generateJson<ScriptPayload>({
      input,
      temperature: 0.6,
      maxOutputTokens: 350,
    });
  }

  /**
   * Generate a follow-up script in response to what the user just said.
   */
  async generateFollowupScript(params: {
    context: CallContext;
    lastUserUtterance: string;
    runningSummary?: string; // summary of this call so far
  }): Promise<ScriptPayload> {
    const { context, lastUserUtterance, runningSummary } = params;
    const { userProfile, riskLevel = 'low' } = context;

    const input = [
      {
        role: 'system',
        content: this.systemInstructions,
      },
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
          `"${lastUserUtterance}"`,
          ``,
          `Estimated risk level for this user: ${riskLevel}`,
          ``,
          `Task:`,
          `1. Acknowledge what the user just said.`,
          `2. Respond empathically and validate feelings.`,
          `3. Ask one appropriate follow-up question (open-ended if possible).`,
          `4. If user sounds distressed or mentions safety issues, gently encourage them to reach out to emergency services or a trusted contact (but DO NOT invent phone numbers).`,
          ``,
          `Output requirements:`,
          `- Return ONLY valid JSON.`,
          `- Shape: { "intent": "followup", "segments": [ ... ], "notesForHumanSupervisor": string | null }.`,
          `- Each segment MUST be short (1–2 sentences max).`,
          `- Use clear, simple language suitable for voice.`,
          `- No emojis, no markup.`,
          `- If there are any subtle safety concerns, mention them in "notesForHumanSupervisor".`,
        ].join('\n'),
      },
    ];

    return this.openai.generateJson<ScriptPayload>({
      input,
      temperature: 0.7,
      maxOutputTokens: 400,
    });
  }
}

/**
 * Shared system prompt for the agent.
 * You can tune this over time.
 */
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
