import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader } from 'lucide-react';
import { useEffect, useState } from 'react';

type PdfPreviewModalProps = {
  url: string | null;
  onClose: () => void;
};

const MAX_RETRIES = 3;

export function PdfPreviewModal({ url, onClose }: PdfPreviewModalProps) {
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!url) {
      setIframeSrc(null);
      setLoading(false);
      setRetryCount(0);
      return;
    }

    const ts = Date.now();
    const src = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}&ts=${ts}`;

    setIframeSrc(src);
    setLoading(true);

    // Retry after 5 seconds if still loading
    const retryTimeout = setTimeout(() => {
      if (loading && retryCount < MAX_RETRIES) {
        console.log(`Retrying PDF load... attempt ${retryCount + 1}`);
        setRetryCount((prev) => prev + 1);
      }
    }, 5000);

    return () => clearTimeout(retryTimeout);
  }, [url, retryCount]);

  useEffect(() => {
    // When retryCount changes, reload the iframeSrc
    if (retryCount > 0 && url) {
      console.log('retrying: ', retryCount, url);
      const ts = Date.now();
      setIframeSrc(
        `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}&ts=${ts}`
      );
      setLoading(true);
    }
  }, [retryCount, url]);

  return (
    <Dialog open={!!url} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-5xl h-[80vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="p-4 border-b h-fit">
          <DialogTitle className="text-base font-semibold">Preview</DialogTitle>
          <DialogDescription>Preview file</DialogDescription>
        </DialogHeader>

        <div className="flex-1 relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex justify-center items-center bg-white/70">
              <Loader className="animate-spin w-6 h-6 text-gray-500" />
            </div>
          )}

          {iframeSrc && (
            <iframe
              key={iframeSrc}
              src={iframeSrc}
              className="w-full h-full border-0"
              title="PDF Preview"
              onLoad={() => {
                console.log('PDF iframe loaded');
                setLoading(false);
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
