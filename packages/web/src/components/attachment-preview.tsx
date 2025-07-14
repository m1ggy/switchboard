import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

type Props = {
  file: File & { id: string };
  onClose: () => void;
};

function AttachmentPreview({ file, onClose }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');

  const handleLoad = () => setIsLoading(false);

  const getReadableSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Card className="relative w-full h-24 overflow-hidden rounded-2xl shadow-md p-0">
      <Button
        variant="ghost"
        size="icon"
        onClick={onClose}
        className="absolute right-1 top-1 z-10 h-6 w-6 bg-white/80 hover:bg-white/90"
      >
        <X className="h-4 w-4 text-muted-foreground" />
      </Button>

      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 h-full">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Updated with min-h-[6rem] (approx. 24) */}
      <CardContent className="p-0 relative h-full">
        {previewUrl && isImage && (
          <img
            src={previewUrl}
            alt={file.name}
            className="w-full h-full object-cover"
            onLoad={handleLoad}
          />
        )}

        {previewUrl && isVideo && (
          <video
            controls
            className="w-full h-full object-cover"
            src={previewUrl}
            onLoadedData={handleLoad}
          />
        )}

        {!isImage && !isVideo && (
          <div className="p-4 text-sm text-muted-foreground">
            Unsupported file preview: {file.name}
          </div>
        )}

        <div className="absolute bottom-1 left-2 rounded-full bg-white/80 px-2 py-0.5 text-xs text-muted-foreground shadow-sm">
          {getReadableSize(file.size)}
        </div>
      </CardContent>
    </Card>
  );
}

export default AttachmentPreview;
