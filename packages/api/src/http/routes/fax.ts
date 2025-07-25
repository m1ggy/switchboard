import axios from 'axios';
import { randomUUID } from 'crypto';
import { FastifyInstance } from 'fastify';

import { ContactsRepository } from '@/db/repositories/contacts';
import { FaxForwardLogRepository } from '@/db/repositories/fax_forward';
import { FaxesRepository } from '@/db/repositories/faxes';
import { InboxesRepository } from '@/db/repositories/inboxes';
import { NumbersRepository } from '@/db/repositories/numbers';
import { uploadAttachmentBuffer } from '@/lib/google/storage';
import { authMiddleware } from '../middlewares/auth';

async function routes(app: FastifyInstance) {
  /**
   * 📥 Inbound fax handler (Telnyx webhook)
   */
  app.post('/', async (request, reply) => {
    const event = request.body as any;
    const payload = event?.data?.payload;
    const eventType = event?.data?.event_type;

    console.log('📩 Incoming Telnyx webhook received');
    console.log('🔍 Event type:', eventType);
    console.log('📦 Raw payload:', JSON.stringify(payload, null, 2));

    if (!payload) {
      console.warn('⚠️ No payload found in webhook');
      return reply.status(200).send('Ignored: missing payload');
    }

    if (eventType !== 'fax.received') {
      console.warn(`⚠️ Ignored event type: ${eventType}`);
      return reply.status(200).send('Ignored: wrong event type');
    }

    if (payload.status !== 'delivered') {
      console.warn(`⚠️ Ignored fax with status: ${payload.status}`);
      return reply.status(200).send('Ignored: status not delivered');
    }

    const { from, to, media_url, fax_id, pages } = payload;

    console.log(`📠 Fax received from ${from} to Telnyx number ${to}`);

    // 🔍 Match fax forward log by sender number
    const recentLogs = await FaxForwardLogRepository.listRecent(50);
    const lastLog = recentLogs.find((log) => log.from_number === from);

    if (!lastLog) {
      console.warn(`⚠️ No fax forward log found for sender: ${from}`);
      return reply.status(200).send('No matching forward log');
    }

    const twilioNumber = lastLog.to_number;
    console.log(`🔗 Matched to Twilio number: ${twilioNumber}`);

    // 🔍 Match Twilio number in our system
    const number = await NumbersRepository.findByNumber(twilioNumber);
    if (!number) {
      console.warn(
        `⚠️ No number record found for Twilio number: ${twilioNumber}`
      );
      return reply.status(200).send('No matching number');
    }

    console.log(`🏢 Matched number belongs to company: ${number.company_id}`);

    // 👤 Find or create contact
    let contact = await ContactsRepository.findByNumber(
      from,
      number.company_id
    );
    if (!contact) {
      console.log(`👤 Creating new contact for ${from}`);
      contact = await ContactsRepository.create({
        id: randomUUID(),
        number: from,
        company_id: number.company_id,
        label: from,
      });
    } else {
      console.log(`👤 Found existing contact: ${contact.id}`);
    }

    // 📥 Create inbox entry
    const inbox = await InboxesRepository.findOrCreate({
      numberId: number.id,
      contactId: contact.id,
    });
    console.log(`📬 Inbox ensured for contact: ${inbox.id}`);

    // ✅ Confirm fax forward log
    await FaxForwardLogRepository.markConfirmed(lastLog.call_sid);
    console.log(`📌 Fax forward log confirmed: ${lastLog.call_sid}`);

    // ☁️ Download and upload fax file
    let gcsUrl = null;
    try {
      console.log(`⬇️ Downloading fax from: ${media_url}`);
      const response = await axios.get(media_url, {
        responseType: 'arraybuffer',
      });
      const buffer = Buffer.from(response.data);
      gcsUrl = await uploadAttachmentBuffer(buffer, `fax-${fax_id}.pdf`);
      console.log(`☁️ Fax file uploaded to: ${gcsUrl}`);
    } catch (err) {
      console.error('❌ Failed to download or upload fax file:', err);
      return reply.status(500).send('Error storing fax file');
    }

    // 🧾 Log the fax
    const fax = await FaxesRepository.create({
      id: randomUUID(),
      number_id: number.id,
      contact_id: contact.id,
      direction: 'inbound',
      status: 'delivered',
      initiated_at: new Date(),
      pages: pages ?? null,
      media_url: gcsUrl,
      fax_id,
      meta: {
        telnyx_to: to,
        telnyx_from: from,
        original_twilio_number: twilioNumber,
      },
    });

    console.log(`✅ Fax stored and logged: ${fax.id}`);
    return reply.status(200).send('Fax processed');
  });

  /**
   * 📤 Outbound fax sender
   */
  app.post('/send', { preHandler: authMiddleware }, async (request, reply) => {
    const files = await request.saveRequestFiles();
    const { to, connection_id } = request.body as {
      to: string;
      connection_id: string;
    };

    if (!to || !connection_id) {
      return reply.status(400).send('Missing `to` or `connection_id`');
    }

    if (files.length === 0) {
      return reply.status(400).send('No file uploaded');
    }

    // 🔍 Lookup the most recent fax forward log from this recipient
    const recentLogs = await FaxForwardLogRepository.listRecent(50);
    const lastLog = recentLogs.find((log) => log.from_number === to);

    if (!lastLog) {
      return reply
        .status(404)
        .send('No fax forward log found for this recipient');
    }

    const twilioNumber = lastLog.to_number;

    // 🔍 Match the Twilio number
    const number = await NumbersRepository.findByNumber(twilioNumber);
    if (!number) {
      return reply.status(404).send('Twilio number not found');
    }

    // 👤 Match or create contact for the recipient
    let contact = await ContactsRepository.findByNumber(to, number.company_id);
    if (!contact) {
      contact = await ContactsRepository.create({
        id: randomUUID(),
        number: to,
        company_id: number.company_id,
        label: to,
      });
    }

    // ☁️ Upload file to GCS
    const file = files[0];
    const fileBuffer = await file.toBuffer();
    const mediaUrl = await uploadAttachmentBuffer(fileBuffer, file.filename);

    // 📤 Send fax via Telnyx
    try {
      const telnyxRes = await axios.post(
        'https://api.telnyx.com/v2/faxes',
        {
          to,
          from: twilioNumber,
          connection_id,
          media_url: mediaUrl,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const faxData = telnyxRes.data.data;

      // 🧾 Log outbound fax
      await FaxesRepository.create({
        id: randomUUID(),
        number_id: number.id,
        contact_id: contact.id,
        direction: 'outbound',
        status: faxData.status ?? 'queued',
        initiated_at: new Date(),
        pages: null,
        media_url: mediaUrl,
        fax_id: faxData.id,
        meta: {
          telnyx_response: faxData,
          to,
          from: twilioNumber,
        },
      });

      console.log(`📤 Outbound fax sent and logged. ID: ${faxData.id}`);
      return reply.send({ success: true, fax: faxData });
    } catch (error) {
      console.error(
        '❌ Fax send failed:',
        error?.response?.data || error.message
      );
      return reply.status(500).send('Failed to send fax');
    }
  });
}

export default routes;
