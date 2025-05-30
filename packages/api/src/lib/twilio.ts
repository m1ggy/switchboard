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

export class TwilioClient {
  client: Twilio;
  private from: string;

  constructor(accountSid: string, authToken: string, fromNumber?: string) {
    this.client = twilio(accountSid, authToken);
    this.from = fromNumber ?? '';
  }

  // ───────────── Messaging ─────────────

  async sendSms(to: string, body: string): Promise<MessageInstance> {
    return await this.client.messages.create({
      body,
      from: this.from,
      to,
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
      areaCode?: number;
      contains?: string;
      smsEnabled?: boolean;
      voiceEnabled?: boolean;
      limit?: number;
    } = {}
  ): Promise<AvailablePhoneNumberInstance[]> {
    return await this.client.availablePhoneNumbers(country).local.list({
      smsEnabled: options.smsEnabled ?? true,
      voiceEnabled: options.voiceEnabled ?? true,
      areaCode: options.areaCode,
      contains: options.contains,
      limit: options.limit ?? 5,
    });
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
