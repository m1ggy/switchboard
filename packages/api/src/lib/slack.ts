import { WebClient } from '@slack/web-api';
import dotenv from 'dotenv';

dotenv.config();

console.log({ env: process.env.SLACK_BOT_TOKEN });

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

interface CallAlertParams {
  from: string;
  to: string;
  channel?: string;
}

/**
 * Sends a call alert message to Slack
 * @param params - Call alert details
 */
export async function sendCallAlertToSlack(
  params: CallAlertParams
): Promise<void> {
  const { from, to, channel } = params;
  const targetChannel = channel || process.env.SLACK_ALERT_CHANNEL;
  const message = `📞 *Incoming Call Alert!*

*From:* \`${from}\`  
*To:* \`${to}\`

🔗 <https://stagingspace.org|Click here to respond>

🕒 *Call is currently on hold.*`;

  try {
    await slack.chat.postMessage({
      channel: targetChannel!,
      text: message,
      mrkdwn: true,
    });

    console.log(`✅ Slack alert sent to ${targetChannel}`);
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    console.error('❌ Failed to send Slack alert:', err.message);
  }
}
