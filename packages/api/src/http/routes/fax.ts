import { ContactsRepository } from '@/db/repositories/contacts';
import { FaxForwardLogRepository } from '@/db/repositories/fax_forward';
import { InboxesRepository } from '@/db/repositories/inboxes';
import { NumbersRepository } from '@/db/repositories/numbers';
import { uploadAttachmentBuffer } from '@/lib/google/storage';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middlewares/auth';

async function routes(app: FastifyInstance) {
  app.post('/', async (request, reply) => {
    const { direction, status, from, to, file, fax_id } =
      request.body as Record<string, string>;

    if (direction !== 'inbound' || status !== 'delivered') {
      return reply.status(200).send('Ignored');
    }

    // 🧩 Match the Twilio number
    const number = await NumbersRepository.findByNumber(to);
    if (!number) {
      console.warn(`No number record found for: ${to}`);
      return reply.status(200).send('No matching number');
    }

    // 👤 Find or create contact
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

    // 📨 Find or create inbox
    await InboxesRepository.findOrCreate({
      numberId: number.id,
      contactId: contact.id,
    });

    // 🧾 Optionally confirm fax forward log
    const recentLogs = await FaxForwardLogRepository.listRecent(10);
    const matchedLog = recentLogs.find(
      (log) =>
        log.from_number === from &&
        log.to_number === to &&
        new Date(log.forwarded_to_fax_at).getTime() >=
          Date.now() - 5 * 60 * 1000
    );

    if (matchedLog) {
      await FaxForwardLogRepository.markConfirmed(matchedLog.call_sid);
    }

    // ⬇️ Download and upload the file
    const response = await axios.get(file, {
      responseType: 'arraybuffer',
      headers: {
        Authorization: `Bearer ${process.env.FAXPLUS_API_TOKEN}`, // if needed
      },
    });

    const buffer = Buffer.from(response.data);
    const gcsUrl = await uploadAttachmentBuffer(buffer, `fax-${fax_id}.pdf`);

    console.log(`✅ Fax stored for ${from} → ${to} [${gcsUrl}]`);

    return reply.status(200).send('Fax processed');
  });

  app.post('/send', { preHandler: authMiddleware }, async (request, reply) => {
    const files = await request.saveRequestFiles();
    const urls: string[] = [];
    for (const file of files) {
      const url = await uploadAttachmentBuffer(
        await file.toBuffer(),
        file.filename
      );
      urls.push(url);
    }

    
  });
}

export default routes;
