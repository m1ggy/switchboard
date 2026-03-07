import axios from 'axios';
import { randomUUID } from 'crypto';
import { FastifyInstance } from 'fastify';

import { UserCompaniesRepository } from '@/db/repositories/companies';
import { ContactsRepository } from '@/db/repositories/contacts';
import { FaxForwardLogRepository } from '@/db/repositories/fax_forward';
import { FaxesRepository } from '@/db/repositories/faxes';
import { InboxesRepository } from '@/db/repositories/inboxes';
import { NumbersRepository } from '@/db/repositories/numbers';
import { UsageRepository } from '@/db/repositories/usage';
import { UsersRepository } from '@/db/repositories/users';
import { uploadAttachmentBuffer } from '@/lib/google/storage';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { authMiddleware } from '../middlewares/auth';

const normalizePhone = (value?: string | null) => {
  if (!value) return '';
  return value.replace(/[^\d+]/g, '');
};

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

    if (!payload || !eventType) {
      return reply.status(200).send('Ignored: missing payload');
    }

    const faxId = payload.fax_id;

    // --- ✅ INBOUND FAX RECEIVED ---
    if (eventType === 'fax.received' && payload.status === 'received') {
      const from = normalizePhone(payload.from);
      const to = normalizePhone(payload.to);
      const { media_url, pages } = payload;

      console.log(`📠 Fax received from ${from} to Telnyx number ${to}`);

      const recentLogs = await FaxForwardLogRepository.listRecent(50);
      const lastLog = recentLogs.find(
        (log) => normalizePhone(log.from_number) === from
      );

      if (!lastLog) {
        console.warn(`⚠️ No fax forward log found for sender: ${from}`);
        return reply.status(200).send('No matching forward log');
      }

      const twilioNumber = normalizePhone(lastLog.to_number);
      const number = await NumbersRepository.findByNumber(twilioNumber);
      if (!number) {
        return reply.status(200).send('No matching number');
      }

      let contact = await ContactsRepository.findByNumber(
        from,
        number.company_id
      );

      if (!contact) {
        contact = await ContactsRepository.create({
          id: randomUUID(),
          number: from,
          company_id: number.company_id,
          label: from,
        });
      }

      await InboxesRepository.findOrCreate({
        numberId: number.id,
        contactId: contact.id,
      });

      await FaxForwardLogRepository.markConfirmed(lastLog.call_sid);

      let gcsUrl: string | null = null;
      try {
        const response = await axios.get(media_url, {
          responseType: 'arraybuffer',
        });
        const buffer = Buffer.from(response.data);
        gcsUrl = await uploadAttachmentBuffer(buffer, `fax-${faxId}.pdf`);
      } catch (err) {
        console.error('❌ Failed to download or upload fax file:', err);
        return reply.status(500).send('Error storing fax file');
      }

      const fax = await FaxesRepository.create({
        id: randomUUID(),
        number_id: number.id,
        contact_id: contact.id,
        direction: 'inbound',
        status: 'delivered',
        initiated_at: new Date(),
        pages: pages ?? null,
        media_url: gcsUrl,
        fax_id: faxId,
        meta: {
          telnyx_to: to,
          telnyx_from: from,
          original_twilio_number: twilioNumber,
        },
      });

      console.log(`✅ Inbound fax stored: ${fax.id}`);
      return reply.status(200).send('Inbound fax processed');
    }

    // --- ✅ OUTBOUND FAX EVENTS ---
    if (payload.direction === 'outbound' && faxId) {
      const { status, failure_reason } = payload;

      const fax = await FaxesRepository.findByFaxId(faxId);
      if (!fax) {
        console.warn(`⚠️ No matching fax found for fax_id: ${faxId}`);
        return reply.status(200).send('No matching fax');
      }

      const finalStatuses = ['delivered', 'failed'];
      const currentStatus = fax.status;

      const alreadyFinal = finalStatuses.includes(currentStatus ?? '');
      if (alreadyFinal) {
        console.log(
          `⏭️ Skipping update for ${faxId} (already ${currentStatus})`
        );
        return reply.status(200).send('No update needed');
      }

      await FaxesRepository.update(fax.id, {
        status,
        meta: {
          ...fax.meta,
          failure_reason: failure_reason || undefined,
          last_event_type: eventType,
          updated_by_webhook: true,
        },
      });

      console.log(`✅ Fax ${faxId} updated to status: ${status}`);
      return reply.status(200).send('Outbound fax updated');
    }

    console.warn(`⚠️ Unhandled or irrelevant event: ${eventType}`);
    return reply.status(200).send('Event ignored');
  });

  /**
   * 📤 Outbound fax sender
   */
  app.post('/send', { preHandler: authMiddleware }, async (request, reply) => {
    try {
      const files = await request.saveRequestFiles();
      const body = request.body as Record<string, Record<string, string>>;

      console.log('BODY: ', body);

      if (!body) {
        return reply.status(500).send('internal server error');
      }

      const companyId = body.companyId?.value;
      const numberId = body.numberId?.value;

      if (!companyId) {
        return reply.status(400).send('Missing `companyId`');
      }

      if (!numberId) {
        return reply.status(400).send('Missing `numberId`');
      }

      const rawCover = JSON.parse(body.cover.value);

      if (typeof rawCover !== 'object' || rawCover === null) {
        return reply.status(400).send('Cover should be an object');
      }

      const coverData = rawCover as Record<string, string>;
      const to = coverData.to;
      const connection_id = process.env.TELNYX_FAX_APP_ID;
      const telnyxSendingNumber = process.env.TELNYX_FAX_NUMBER;

      if (!to || !connection_id || !telnyxSendingNumber) {
        return reply
          .status(400)
          .send('Missing `to`, `connection_id`, or sending fax number');
      }

      if (files.length === 0) {
        return reply.status(400).send('No file uploaded');
      }

      const authUser = request.user as { uid: string };

      const user = await UsersRepository.findByFirebaseUid(authUser.uid);
      if (!user) {
        return reply.status(404).send('Authenticated user not found');
      }

      // Verify user has access to the selected company
      const userCompanies = await UserCompaniesRepository.findCompaniesByUserId(
        user.user_id
      );

      const hasAccess = userCompanies.some((c) => c.id === companyId);
      if (!hasAccess) {
        return reply.status(403).send('You do not have access to this company');
      }

      // Use the exact number selected by the client
      const number = await NumbersRepository.findById(numberId);
      if (!number) {
        return reply.status(404).send('Selected number not found');
      }

      // Make sure the selected number belongs to the selected company
      if (number.company_id !== companyId) {
        return reply
          .status(403)
          .send('Selected number does not belong to this company');
      }

      let contact = await ContactsRepository.findByNumber(to, companyId);
      if (!contact) {
        contact = await ContactsRepository.create({
          id: randomUUID(),
          number: to,
          company_id: companyId,
          label: coverData.toName || to,
        });
      }

      await InboxesRepository.findOrCreate({
        contactId: contact.id,
        numberId: number.id,
      });

      const file = files[0];
      const uploadedBuffer = await file.toBuffer();

      // Load uploaded PDF to count pages
      const userPdf = await PDFDocument.load(uploadedBuffer);
      const userPageCount = userPdf.getPageCount();
      const totalPages = 1 + userPageCount;

      // Generate cover page PDF
      const coverPdf = await PDFDocument.create();
      const page = coverPdf.addPage();
      const font = await coverPdf.embedFont(StandardFonts.Courier);
      const { height } = page.getSize();
      let y = height - 50;

      const line = (text: string = '') => {
        page.drawText(text, { x: 50, y, size: 12, font });
        y -= 20;
      };

      const today = new Date().toLocaleDateString();

      line('----------------------------------------');
      line('               FAX COVER                ');
      line('----------------------------------------');
      line('');
      line(`Date:        ${today}`);
      line(`Pages:       ${totalPages} (including this cover)`);
      line('');
      line(`From:        ${coverData.fromName || ''}`);
      line(`Fax:         ${coverData.fromFax || number.number || ''}`);
      line('');
      line(`To:          ${coverData.toName || to}`);
      line('');
      line(`Subject:     ${coverData.subject || ''}`);
      line('');
      line('----------------------------------------');
      line('CONFIDENTIALITY NOTICE:');
      line('This fax may contain confidential information');
      line('intended only for the recipient. If you are not');
      line('the intended recipient, please notify the sender');
      line('and destroy this document.');
      line('----------------------------------------');

      // Merge cover + uploaded PDF
      const mergedPdf = await PDFDocument.create();
      const coverPages = await mergedPdf.copyPages(coverPdf, [0]);
      const userPages = await mergedPdf.copyPages(
        userPdf,
        userPdf.getPageIndices()
      );

      mergedPdf.addPage(coverPages[0]);
      userPages.forEach((p) => mergedPdf.addPage(p));

      const mergedBuffer = await mergedPdf.save();

      // Upload merged PDF
      const mediaUrl = await uploadAttachmentBuffer(
        Buffer.from(mergedBuffer),
        `fax-${randomUUID()}.pdf`
      );

      // Send through shared Telnyx fax number
      const telnyxRes = await axios.post(
        'https://api.telnyx.com/v2/faxes',
        {
          to,
          from: telnyxSendingNumber,
          connection_id,
          media_url: mediaUrl,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.TELNYX_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const faxData = telnyxRes.data.data;

      await FaxesRepository.create({
        id: randomUUID(),
        number_id: number.id,
        contact_id: contact.id,
        direction: 'outbound',
        status: faxData.status ?? 'queued',
        initiated_at: new Date(),
        pages: totalPages,
        media_url: mediaUrl,
        fax_id: faxData.id,
        meta: {
          telnyx_response: faxData,
          to,
          from: telnyxSendingNumber,
          company_id: companyId,
          selected_number_id: number.id,
          cover_from_fax: coverData.fromFax || null,
        },
      });

      console.log(`📤 Outbound fax sent and logged. ID: ${faxData.id}`);

      await UsageRepository.create({
        id: randomUUID(),
        subscription_id: user?.stripe_subscription_id as string,
        user_id: authUser.uid,
        amount: 1,
        type: 'fax',
      });

      return reply.send({ success: true, fax: faxData });
    } catch (error: any) {
      console.error(
        '❌ Fax send failed:',
        error?.response?.data || error?.message || error
      );
      return reply.status(500).send('Failed to send fax');
    }
  });
}

export default routes;
