import type { Company } from 'api/types/db';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Separator } from './ui/separator';

// ⬇️ adjust these imports to your app paths
import { getQueryClient } from '@/App'; // your helper that returns the QueryClient
import { auth } from '@/lib/firebase'; // or wherever you export your Firebase auth
import { useTRPC } from '@/lib/trpc';

type CompanyWithHold = Company & {
  hold_audio_url?: string | null;
};

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

const ACCEPT_ATTR = Array.from(
  new Set([...TWILIO_AUDIO_MIMES, ...TWILIO_AUDIO_EXTS])
).join(',');

function isTwilioAudio(file: File) {
  const mime = (file.type || '').toLowerCase();
  const ext = (file.name.match(/\.[^.]+$/)?.[0] || '').toLowerCase();
  return TWILIO_AUDIO_MIMES.has(mime) || TWILIO_AUDIO_EXTS.has(ext);
}

type Props = {
  open: boolean;
  setOpen: (val: boolean) => void;
  company: CompanyWithHold | null;
  onCompanyUpdated?: (company: CompanyWithHold) => void;
};

export default function CompanySettingsDialog({
  open,
  setOpen,
  company,
  onCompanyUpdated,
}: Props) {
  const [localCompany, setLocalCompany] = useState<CompanyWithHold | null>(
    company
  );
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const trpc = useTRPC();
  useEffect(() => {
    setLocalCompany(company ?? null);
    setFile(null);
    setError(null);
    setIsUploading(false);
    setIsRemoving(false);
  }, [company, open]);

  const hasAudio = Boolean(localCompany?.hold_audio_url);
  const isFormValid = Boolean(file && localCompany?.id && isTwilioAudio(file));
  const fileLabel = useMemo(() => (file ? file.name : 'Choose file'), [file]);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    setError(null);
    if (picked && !isTwilioAudio(picked)) {
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      setError(
        'Unsupported audio type. Allowed: MP3, WAV, AIFF/AIFC, GSM, and u-law (.ulaw).'
      );
      return;
    }
    setFile(picked);
  }

  // ⬇️ Follow your exact pattern: isFormValid check, setIsSending-like flag, FormData, token, env URL, reset + invalidate
  const handleUpload = async () => {
    if (!isFormValid || !localCompany?.id) return;
    setIsUploading(true);

    const formData = new FormData();
    formData.append('companyId', localCompany.id);
    if (file) formData.append('file', file);

    try {
      const token = await auth.currentUser?.getIdToken();

      const res = await fetch(
        `${import.meta.env.VITE_WEBSOCKET_URL}/companies/audio/upload`,
        {
          method: 'POST',
          body: formData,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Upload failed (${res.status})`);
      }

      const updated: CompanyWithHold = data.company ?? {
        ...(localCompany as CompanyWithHold),
        hold_audio_url: data.url,
      };

      // reset states like your handleSend
      setIsUploading(false);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';

      setLocalCompany(updated);
      onCompanyUpdated?.(updated);

      // invalidate anything relevant (adjust to your app's queries)
      const client = getQueryClient();
      client.invalidateQueries({
        queryKey: trpc.companies.getUserCompanies.queryKey(),
      });
    } catch (e: any) {
      setIsUploading(false);
      setError(e?.message || 'Something went wrong while uploading.');
    }
  };

  const handleRemove = async () => {
    if (!localCompany?.id) return;
    setIsRemoving(true);
    setError(null);

    try {
      const token = await auth.currentUser?.getIdToken();

      const res = await fetch(
        `${import.meta.env.VITE_WEBSOCKET_URL}/companies/${localCompany.id}/audio/hold-audio`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ url: null }),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Remove failed (${res.status})`);
      }

      const updated: CompanyWithHold = data.company ?? {
        ...(localCompany as CompanyWithHold),
        hold_audio_url: null,
      };

      setIsRemoving(false);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      setLocalCompany(updated);
      onCompanyUpdated?.(updated);

      // invalidate like your handleSend
      const client = getQueryClient();
      client.invalidateQueries({
        queryKey: trpc.companies.getUserCompanies.queryKey(),
      });
    } catch (e: any) {
      setIsRemoving(false);
      setError(e?.message || 'Something went wrong while removing the file.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Company Settings</DialogTitle>
          <DialogDescription>
            Update {localCompany?.name ?? 'company'} settings
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-medium">Hold Music</h3>

            {hasAudio ? (
              <div className="rounded-xl border p-4 space-y-3">
                <div className="text-sm text-muted-foreground">
                  Current audio:
                </div>
                <audio
                  className="w-full"
                  controls
                  src={localCompany?.hold_audio_url ?? undefined}
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant="destructive"
                    onClick={handleRemove}
                    disabled={isRemoving || isUploading}
                  >
                    {isRemoving ? 'Removing…' : 'Remove'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No hold music uploaded yet.
              </div>
            )}

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="hold-audio">
                {hasAudio ? 'Replace file' : 'Upload file'}
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  id="hold-audio"
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT_ATTR}
                  onChange={onPickFile}
                  disabled={isUploading || isRemoving}
                />
                <Button
                  onClick={handleUpload}
                  disabled={
                    !isFormValid ||
                    isUploading ||
                    isRemoving ||
                    !localCompany?.id
                  }
                >
                  {isUploading ? 'Uploading…' : hasAudio ? 'Replace' : 'Upload'}
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">{fileLabel}</div>
              <p className="text-xs text-muted-foreground">
                Allowed: MP3, WAV, AIFF/AIFC, GSM, u-law (.ulaw). Larger
                bitrates may degrade on phones.
              </p>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
