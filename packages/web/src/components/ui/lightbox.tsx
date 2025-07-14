'use client';

import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';

type LightboxProps = {
  images: { id: string; media_url: string; file_name: string }[];
  initialIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function Lightbox({
  images,
  initialIndex,
  open,
  onOpenChange,
}: LightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [loading, setLoading] = useState(false);

  const current = images[index];

  const canGoPrev = index > 0;
  const canGoNext = index < images.length - 1;

  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    setLoading(true);
  }, [index]);

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        onOpenChange(val);
      }}
    >
      <DialogContent className="max-w-[90vw] max-h-[90vh] bg-black p-0 overflow-hidden [&>button:last-child]:hidden">
        {canGoPrev && (
          <button
            onClick={() => setIndex(index - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-50 bg-white/80 hover:bg-white text-black rounded"
          >
            <ArrowLeft className="h-8 w-8" />
          </button>
        )}
        <DialogClose className="absolute top-2 right-2 z-50 bg-white/80 hover:bg-white text-black rounded border border-gray-300">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </DialogClose>

        {canGoNext && (
          <button
            onClick={() => setIndex(index + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-50 bg-white/80 hover:bg-white text-black rounded"
          >
            <ArrowRight className="h-8 w-8" />
          </button>
        )}

        <img
          src={current?.media_url}
          alt={current?.file_name}
          className="mx-auto max-h-[90vh] max-w-full object-contain"
          onLoad={() => setLoading(false)}
        />
        {loading && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-white border-t-transparent" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
