import { nanoid } from 'nanoid';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

type PreppedAttachment = {
  filename: string;
  base64: string;
};

const getReadableSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result as string;

      const base64 = result.split(',')[1];
      resolve(base64);
    };

    reader.onerror = reject;

    reader.readAsDataURL(file);
  });
}

export function useAttachmentPrep() {
  const [attachments, setAttachments] = useState<(File & { id: string })[]>([]);

  const totalSize = useMemo(
    () => getReadableSize(attachments.reduce((sum, f) => sum + f.size, 0)),
    [attachments]
  );

  function addAttachment(file: File) {
    const MAX_TOTAL_SIZE = 5 * 1024 * 1024; // 5 MB in bytes

    const existing = attachments.find(
      (attachment) => attachment.name === file.name
    );
    if (existing) {
      toast.error('File already selected');
      return;
    }

    if (file.size > MAX_TOTAL_SIZE) {
      toast.error('File is larger than 5 MB');
      return;
    }

    const totalSize =
      attachments.reduce((sum, f) => sum + f.size, 0) + file.size;
    if (totalSize > MAX_TOTAL_SIZE) {
      toast.error('Total attachments size exceeds 5 MB');
      return;
    }

    const fileWithId = file as File & { id: string };
    fileWithId.id = nanoid();

    setAttachments((prev) => [...prev, fileWithId]);
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((file) => file.id !== id));
  }

  function clearAttachments() {
    setAttachments([]);
  }

  async function getBase64Attachments() {
    const convertedData = await Promise.all(
      attachments.map(async (file) => await fileToBase64(file))
    );

    return attachments.map((file, i) => ({
      base64: convertedData[i],
      filename: file.name,
    })) as PreppedAttachment[];
  }

  return {
    attachments,
    addAttachment,
    removeAttachment,
    getBase64Attachments,
    totalSize,
    clearAttachments,
  };
}
