import type { FastifyInstance } from 'fastify';

export async function twilioMediaStreamRoutes(app: FastifyInstance) {
  app.get('/voice/stream', { websocket: true }, (socket, req) => {
    // socket is a ws.WebSocket instance
    let streamSid: string | null = null;
    let callSid: string | null = null;
    let mediaCount = 0;

    app.log.info({ ip: req.ip, url: req.url }, '[MediaStream] WS connected');

    socket.on('message', (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        app.log.warn({ raw: raw.toString() }, '[MediaStream] Non-JSON message');
        return;
      }

      switch (msg.event) {
        case 'connected':
          app.log.info('[MediaStream] connected event');
          break;

        case 'start':
          streamSid = msg.start?.streamSid ?? null;
          callSid = msg.start?.callSid ?? null;
          app.log.info({ streamSid, callSid }, '[MediaStream] start');
          break;

        case 'media':
          mediaCount++;
          if (mediaCount % 50 === 0) {
            app.log.info(
              { streamSid: msg.streamSid, mediaCount },
              '[MediaStream] receiving media'
            );
          }
          // msg.media.payload is base64 audio (mulaw 8k typically)
          // TODO: forward Buffer.from(msg.media.payload, 'base64') to STT
          break;

        case 'stop':
          app.log.info({ streamSid: msg.streamSid }, '[MediaStream] stop');
          socket.close();
          break;

        case 'mark':
          app.log.info(
            { streamSid: msg.streamSid, name: msg.mark?.name },
            '[MediaStream] mark'
          );
          break;

        default:
          // useful during early testing
          // app.log.debug({ msg }, '[MediaStream] event');
          break;
      }
    });

    socket.on('close', (code, reason) => {
      app.log.info(
        { streamSid, callSid, code, reason: reason?.toString() },
        '[MediaStream] WS closed'
      );
    });

    socket.on('error', (err) => {
      app.log.error({ err, streamSid, callSid }, '[MediaStream] WS error');
    });

    // OPTIONAL helpers for bidirectional streams (server -> Twilio)
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

    function clearTwilioAudio() {
      if (!streamSid) return;
      socket.send(JSON.stringify({ event: 'clear', streamSid }));
    }

    function sendMark(name: string) {
      if (!streamSid) return;
      socket.send(JSON.stringify({ event: 'mark', streamSid, mark: { name } }));
    }

    // You’ll call these later once you hook up STT/TTS.
    void sendAudioToTwilio;
    void clearTwilioAudio;
    void sendMark;
  });
}
