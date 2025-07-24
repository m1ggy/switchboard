import Telnyx from 'telnyx';

const telnyx = new Telnyx(process.env.TELNYX_API_TOKEN as string);

export async function sendFax(file: string, to: string, from: string) {
  telnyx.faxes.send(
    {
      to,
      from,
      media_url: file,
      connection_id: process.env.TELNYX_FAX_APP_ID as string,
      t38_enabled: true,
      monochrome: false,
      store_media: true,
      store_preview: true,
      preview_format: 'pdf',
    },
    { headers: { Authorization: `Bearer ${process.env.TELNYX_API_TOKEN}` } }
  );
}
