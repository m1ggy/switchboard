import { getDocument, PasswordResponses } from 'pdfjs-dist';

export async function isPdfPasswordProtected(file: File): Promise<boolean> {
  try {
    const data = await file.arrayBuffer();

    await getDocument({ data }).promise;
    return false;
  } catch (error) {
    const pdfError = error as unknown as Record<string, string | number>;
    if (
      pdfError?.name === 'PasswordException' ||
      pdfError?.code === PasswordResponses.NEED_PASSWORD
    ) {
      return true;
    }

    return false;
  }
}
