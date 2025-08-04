import twilio, { type Twilio } from 'twilio';
const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;

type MessageInstance = Awaited<ReturnType<Twilio['messages']['create']>>;
type CallInstance = Awaited<ReturnType<Twilio['calls']['create']>>;
type IncomingPhoneNumberInstance = Awaited<
  ReturnType<Twilio['incomingPhoneNumbers']['create']>
>;
type AvailablePhoneNumberInstance = Awaited<
  ReturnType<ReturnType<Twilio['availablePhoneNumbers']>['local']['list']>
>[number];

export const TWILIO_ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',

  // Videos
  'video/3gpp',
  'video/mp4',

  // Audio
  'audio/mpeg',
  'audio/mp3',
  'audio/amr',
  'audio/aac',
  'audio/ogg',

  // Documents (only on supported carriers)
  'application/pdf',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

function buildCacheKey(
  prefix: string,
  params: Record<string, string | number | boolean | undefined>
): string {
  const sortedEntries = Object.entries(params)
    .filter(([_, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));

  const key = sortedEntries.map(([k, v]) => `${k}=${v}`).join('&');
  return `${prefix}:${key}`;
}

const numberSearchCache = new Map<
  string,
  { data: AvailablePhoneNumberInstance[]; expiresAt: number }
>();

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class TwilioClient {
  client: Twilio;
  private from: string;

  constructor(accountSid: string, authToken: string, fromNumber?: string) {
    this.client = twilio(accountSid, authToken);
    this.from = fromNumber ?? '';
  }

  // ───────────── Messaging ─────────────

  async sendSms(
    to: string,
    body: string,
    mediaUrls?: string[]
  ): Promise<MessageInstance> {
    return await this.client.messages.create({
      body,
      from: this.from,
      to,
      mediaUrl: mediaUrls ?? [],
    });
  }

  async getMessage(sid: string): Promise<MessageInstance> {
    return await this.client.messages(sid).fetch();
  }

  // ───────────── Voice ─────────────

  async makeCall(to: string, twimlUrl: string): Promise<CallInstance> {
    return await this.client.calls.create({
      url: twimlUrl,
      to,
      from: this.from,
    });
  }

  // ───────────── Number Management ─────────────

  /**
   * Search available phone numbers
   * @param country ISO country code (e.g., 'US')
   * @param options Filters for area code, partial match, capabilities
   */
  async searchAvailableNumbers(
    country: string,
    options: {
      areaCode?: string;
      contains?: string;
      smsEnabled?: boolean;
      voiceEnabled?: boolean;
      limit?: number;
    } = {}
  ): Promise<AvailablePhoneNumberInstance[]> {
    const {
      areaCode,
      contains,
      smsEnabled = true,
      voiceEnabled = true,
      limit = 5,
    } = options;

    const cacheKey = buildCacheKey('twilio:numbers', {
      country,
      areaCode,
      contains,
      smsEnabled,
      voiceEnabled,
      limit,
    });

    const now = Date.now();
    const cached = numberSearchCache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    const numbers = await this.client
      .availablePhoneNumbers(country)
      .local.list({
        smsEnabled,
        voiceEnabled,
        areaCode: areaCode as unknown as number,
        contains,
        limit,
      });

    numberSearchCache.set(cacheKey, {
      data: numbers,
      expiresAt: now + CACHE_TTL_MS,
    });

    return numbers;
  }

  /**
   * Purchase a Twilio phone number
   * @param phoneNumber The E.164 formatted number to buy
   * @param options Optional webhook and friendly name settings
   */
  async purchaseNumber(
    phoneNumber: string,
    options?: {
      voiceUrl?: string;
      smsUrl?: string;
      friendlyName?: string;
    }
  ): Promise<IncomingPhoneNumberInstance> {
    return await this.client.incomingPhoneNumbers.create({
      phoneNumber,
      voiceUrl: options?.voiceUrl,
      smsUrl: options?.smsUrl,
      friendlyName: options?.friendlyName,
    });
  }

  /**
   * Release a Twilio phone number
   * @param sid The Twilio SID of the purchased number
   */
  async releaseNumber(sid: string): Promise<boolean> {
    return await this.client.incomingPhoneNumbers(sid).remove();
  }

  generateVoiceToken({
    apiKeySid,
    apiKeySecret,
    outgoingApplicationSid,
    identity,
    ttl = 3600, // default 1 hour
  }: {
    apiKeySid: string;
    apiKeySecret: string;
    outgoingApplicationSid: string;
    identity: string;
    ttl: number;
  }): string {
    const token = new AccessToken(
      this.client.accountSid,
      apiKeySid,
      apiKeySecret,
      { ttl, identity }
    );

    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid,
      incomingAllow: true,
    });

    token.addGrant(voiceGrant);

    return token.toJwt();
  }

  /**
   * Redirect a live call to a client identity (bridge to agent)
   * @param callSid The active Call SID
   * @param clientIdentity The Twilio Client identity (e.g., "+15551234567")
   * @param webhookUrl The TwiML URL that returns `<Dial><Client>...</Client></Dial>`
   */
  async bridgeCallToClient(
    callSid: string,
    clientIdentity: string,
    webhookUrl: string
  ): Promise<CallInstance> {
    return await this.client.calls(callSid).update({
      url: webhookUrl + `?client=${encodeURIComponent(clientIdentity)}`,
      method: 'POST',
    });
  }
}
