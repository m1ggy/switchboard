import { useState } from 'react';

type Attachment = {
  file_name: string;
  media_url: string;
  id: string;
  content_type: string;
};

export function useLightbox() {
  const [files, setFiles] = useState<Attachment[]>([]);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);

  return {
    setIndex,
    setFiles,
    files,
    index,
    setOpen,
    open,
  };
}
