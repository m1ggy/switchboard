import { UserCompaniesRepository } from '@/db/repositories/companies';
import { uploadAttachmentBuffer } from '@/lib/google/storage';
import { FastifyInstance } from 'fastify';
import path from 'path';
import { authMiddleware } from '../middlewares/auth';

const TWILIO_AUDIO_MIMES = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/aiff',
  'audio/x-aiff',
  'audio/x-aifc',
  'audio/gsm',
  'audio/x-gsm',
  'audio/ulaw',
]);

const TWILIO_AUDIO_EXTS = new Set([
  '.mp3',
  '.wav',
  '.wave',
  '.aiff',
  '.aifc',
  '.gsm',
  '.ulaw',
]);

function isTwilioAudio(filename: string, mimetype?: string) {
  const ext = path.extname(filename || '').toLowerCase();
  const mt = (mimetype || '').toLowerCase();
  return TWILIO_AUDIO_EXTS.has(ext) || TWILIO_AUDIO_MIMES.has(mt);
}

// Parse URL or fallback to raw path to validate extension
function extFromUrlOrName(urlOrName: string) {
  try {
    const u = new URL(urlOrName);
    return path.extname(u.pathname || '').toLowerCase();
  } catch {
    return path.extname(urlOrName || '').toLowerCase();
  }
}

async function routes(app: FastifyInstance) {
  /**
   * 🎵 Upload and set hold audio (multipart)
   * Expects: FormData { companyId, file }
   */
  app.post(
    '/audio/upload',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const files = await request.saveRequestFiles();
      const body = request.body as Record<string, any>;

      console.log('🎵 Hold audio upload — incoming');

      if (!body) return reply.status(500).send('internal server error');

      // ⬇️ IMPORTANT: read multipart field .value to avoid circular JSON
      const companyId =
        body?.companyId?.value ??
        (typeof body?.companyId === 'string' ? body.companyId : null);

      if (!companyId) {
        console.warn('⚠️ Missing companyId');
        return reply.status(400).send('Missing companyId');
      }

      if (!files || files.length === 0) {
        console.warn('⚠️ No file uploaded');
        return reply.status(400).send('No file uploaded');
      }

      const file = files[0];

      // Validate Twilio-supported audio
      if (!isTwilioAudio(file.filename, (file as any).mimetype)) {
        console.warn('⚠️ Unsupported audio type', {
          filename: file.filename,
          mimetype: (file as any).mimetype,
        });
        return reply
          .status(415)
          .send(
            'Unsupported audio type. Allowed: MP3, WAV, AIFF/AIFC, GSM, u-law (.ulaw)'
          );
      }

      try {
        const buffer = await file.toBuffer();
        const publicUrl = await uploadAttachmentBuffer(buffer, file.filename);

        const company = await UserCompaniesRepository.updateHoldAudio({
          id: companyId,
          url: publicUrl,
        });

        console.log(`✅ Hold audio set for company ${companyId}: ${publicUrl}`);
        return reply.send({ success: true, url: publicUrl, company });
      } catch (err) {
        console.error('❌ Failed to upload or store hold audio:', err);
        return reply.status(500).send('Error storing audio file');
      }
    }
  );

  /**
   * 🎛️ Set/Clear hold audio by URL (JSON)
   * Body: { url: string | null }
   */
  app.post(
    '/:id/audio/hold-audio',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { url } = (request.body as { url: string | null }) ?? {};

      if (url !== null && typeof url !== 'string') {
        console.warn('⚠️ Invalid url value (must be string or null)');
        return reply.status(400).send('Invalid url value');
      }

      if (typeof url === 'string') {
        const ext = extFromUrlOrName(url);
        if (!TWILIO_AUDIO_EXTS.has(ext)) {
          console.warn('⚠️ Unsupported audio extension for URL', { url, ext });
          return reply
            .status(415)
            .send(
              'Unsupported audio type. Allowed: .mp3, .wav, .wave, .aiff, .aifc, .gsm, .ulaw'
            );
        }
      }

      try {
        const company = await UserCompaniesRepository.updateHoldAudio({
          id,
          url: url ?? null,
        });

        console.log(
          `✅ Hold audio ${url ? 'updated' : 'cleared'} for company ${id}${url ? ` → ${url}` : ''}`
        );
        return reply.send({ company });
      } catch (err) {
        console.error('❌ Failed to update hold audio in DB:', err);
        return reply.status(500).send('Failed to update hold audio');
      }
    }
  );
}

export default routes;
