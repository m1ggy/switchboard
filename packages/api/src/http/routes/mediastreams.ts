import type { FastifyInstance } from 'fastify';

type TwilioStreamMessage =
  | { event: 'connected' }
  | {
      event: 'start';
      start: { streamSid: string; callSid: string; tracks?: string[] };
    }
  | {
      event: 'media';
      streamSid: string;
      media: { payload: string; track?: string; timestamp?: string };
    }
  | { event: 'mark'; streamSid: string; mark: { name: string } }
  | { event: 'stop'; streamSid: string }
  | { event: 'dtmf'; streamSid: string; dtmf: { digit: string } };

export async function twilioMediaStreamRoutes(app: FastifyInstance) {
  app.get('/voice/stream', { websocket: true }, (connection, req) => {
    const socket = connection.socket;

    let streamSid: string | null = null;
    let callSid: string | null = null;

    socket.on('message', async (raw) => {
      let msg: TwilioStreamMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        app.log.warn({ raw: raw.toString() }, '[MediaStream] Non-JSON message');
        return;
      }

      switch (msg.event) {
        case 'connected':
          app.log.info('[MediaStream] WS connected');
          break;

        case 'start':
          streamSid = msg.start.streamSid;
          callSid = msg.start.callSid;
          app.log.info({ streamSid, callSid }, '[MediaStream] start');
          break;

        case 'media': {
          // inbound audio from caller (base64, mulaw 8k typically)
          // msg.media.payload is base64 audio chunk
          // TODO: forward to STT pipeline
          // e.g. stt.feed(Buffer.from(msg.media.payload, 'base64'))
          break;
        }

        case 'mark':
          app.log.info(
            { streamSid: msg.streamSid, name: msg.mark.name },
            '[MediaStream] mark'
          );
          break;

        case 'dtmf':
          app.log.info({ digit: msg.dtmf.digit }, '[MediaStream] dtmf');
          break;

        case 'stop':
          app.log.info({ streamSid: msg.streamSid }, '[MediaStream] stop');
          socket.close();
          break;
      }
    });

    socket.on('close', () => {
      app.log.info({ streamSid, callSid }, '[MediaStream] WS closed');
    });

    /**
     * Helper: send audio BACK to Twilio for playback (bidirectional streams).
     *
     * payload MUST be base64 encoded audio/x-mulaw @ 8000 Hz
     * Twilio buffers media messages and plays them in order. Use "clear" to interrupt.
     */
    function sendAudioToTwilio(mulawBase64: string) {
      if (!streamSid) return;
      socket.send(
        JSON.stringify({
          event: 'media',
          streamSid,
          media: { payload: mulawBase64 },
        })
      );
    }

    /**
     * Helper: clear any buffered outbound audio (useful for barge-in).
     */
    function clearTwilioAudio() {
      if (!streamSid) return;
      socket.send(JSON.stringify({ event: 'clear', streamSid }));
    }

    /**
     * Helper: insert a mark event (lets you track playback progress).
     */
    function sendMark(name: string) {
      if (!streamSid) return;
      socket.send(JSON.stringify({ event: 'mark', streamSid, mark: { name } }));
    }

    // You’ll later call sendAudioToTwilio(...) when ElevenLabs/your TTS returns audio.
  });
}
