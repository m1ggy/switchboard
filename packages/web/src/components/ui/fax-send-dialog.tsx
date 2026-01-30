'use client';

import type React from 'react';

import { getQueryClient } from '@/App';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { auth } from '@/lib/firebase';
import { isPdfPasswordProtected } from '@/lib/pdf';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { FileText, Loader2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// Contact picker bits (copied style from SendMessageDialog)
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { PhoneInput } from '@/components/ui/phone-input';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useMobileVh } from '@/hooks/use-is-mobile-unit';
import { toast } from 'sonner';

type FaxDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTo?: string;
  defaultFromName?: string;
  contactId?: string; // optional
};

type AttachedFile = {
  file: File;
  id: string;
  name: string;
  size: number;
};

export default function FaxSendDialog({
  open,
  onOpenChange,
  defaultTo = '',
  defaultFromName = '',
  contactId,
}: FaxDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { activeNumber, activeCompany } = useMainStore();
  const trpc = useTRPC();

  // Contact selection mode
  const [mode, setMode] = useState<'phone' | 'contact'>('phone');
  const [showCoverPreview, setShowCoverPreview] = useState(false);

  const isMobile = useIsMobile();
  const mobileMax = useMobileVh(55);

  // Contacts for the picker
  const { data: contacts } = useQuery(
    trpc.contacts.getCompanyContacts.queryOptions({
      companyId: activeCompany?.id as string,
    })
  );

  // Selected contact (if any)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null
  );
  const selectedContact = contacts?.find((c) => c.id === selectedContactId);

  // Form state
  const [fromName, setFromName] = useState(defaultFromName);
  const [toName, setToName] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');

  // File state
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [fileError, setFileError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Prefill `to` on first load from defaultTo
  useEffect(() => {
    if (!to && defaultTo) setTo(defaultTo);
  }, [defaultTo, to]);

  // If a contactId prop is provided, try to preselect that contact (best-effort)
  useEffect(() => {
    if (!contacts || !contactId) return;
    const found = contacts.find((c) => c.id === contactId);
    if (found) {
      setSelectedContactId(found.id);
      setMode('contact');
      setTo(found.number);
      if (!toName) setToName(found.label || '');
    }
  }, [contacts, contactId, toName]);

  const MAX_SIZE = 50 * 1024 * 1024;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setFileError('Only PDF files are allowed.');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_SIZE) {
      setFileError('File must be under 50MB.');
      e.target.value = '';
      return;
    }
    const protectedPdf = await isPdfPasswordProtected(file);
    if (protectedPdf) {
      setFileError('Password-protected PDFs cannot be uploaded.');
      e.target.value = '';
      return;
    }

    setFileError('');
    setIsUploading(true);

    setTimeout(() => {
      setAttachedFile({
        file,
        id: Math.random().toString(36).slice(2),
        name: file.name,
        size: file.size,
      });
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }, 600);
  };

  const removeFile = () => setAttachedFile(null);
  const formatFileSize = (bytes: number) =>
    `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

  const isFormValid =
    fromName.trim().length > 0 &&
    toName.trim().length > 0 &&
    to.trim().length > 0 &&
    subject.trim().length > 0 &&
    !!attachedFile;

  const handleSend = async () => {
    if (!isFormValid) return;
    setIsSending(true);

    try {
      const formData = new FormData();
      if (attachedFile) formData.append('file', attachedFile.file);
      formData.append('to', to);

      formData.append(
        'cover',
        JSON.stringify({
          fromName,
          toName,
          subject,
          fromFax: activeNumber?.number,
          to,
        })
      );

      const token = await auth.currentUser?.getIdToken();
      await fetch(`${import.meta.env.VITE_WEBSOCKET_URL}/fax/send`, {
        method: 'POST',
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      // reset
      setAttachedFile(null);
      setFromName('');
      setSubject('');
      setTo('');
      setToName('');
      setSelectedContactId(null);
      setMode('phone');
      setShowCoverPreview(false);

      // Invalidate inbox activity if we have a contact context (prop or selected)
      const client = getQueryClient();
      const targetContactId = contactId ?? selectedContactId ?? undefined;
      if (targetContactId && activeNumber?.id) {
        client.invalidateQueries({
          queryKey: trpc.inboxes.getActivityByContact.infiniteQueryOptions({
            contactId: targetContactId,
            numberId: activeNumber.id as string,
          }).queryKey,
        });
      }
      toast.success('Fax queued');
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error('Failed to send fax');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={clsx(
          'sm:max-w-3xl p-0 gap-0',
          'max-h-[90dvh] overflow-hidden flex flex-col'
        )}
      >
        <DialogHeader className="px-4 sm:px-6 pt-4 pb-2 flex-shrink-0">
          <DialogTitle className="text-base sm:text-lg">Send Fax</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Fill out the fields and attach a PDF to send.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-4">
          <div
            className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6"
            style={{
              ...(isMobile ? { maxHeight: mobileMax } : { maxHeight: '90vh' }),
            }}
          >
            {/* Left column: Form fields */}
            <div className="space-y-4">
              {/* Mode toggle, mobile-friendly */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="flex-1 sm:flex-none text-xs sm:text-sm"
                  variant={mode === 'phone' ? 'default' : 'outline'}
                  onClick={() => {
                    setMode('phone');
                    setSelectedContactId(null);
                  }}
                >
                  Phone Number
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="flex-1 sm:flex-none text-xs sm:text-sm"
                  variant={mode === 'contact' ? 'default' : 'outline'}
                  onClick={() => setMode('contact')}
                >
                  From Contacts
                </Button>
              </div>

              {/* Selected contact summary */}
              {selectedContactId && selectedContact && (
                <div className="flex items-center justify-between text-xs sm:text-sm text-green-600 font-medium -mb-1 gap-2">
                  <span className="truncate">
                    {selectedContact.label} — {selectedContact.number}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedContactId(null);
                      setTo('');
                      setToName('');
                      setMode('phone');
                    }}
                    className="text-red-500 hover:text-red-700 px-2 flex-shrink-0"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Clear
                  </Button>
                </div>
              )}

              {/* To (Fax Number) */}
              <div className="grid gap-2">
                <Label className="text-sm">To (Fax Number)</Label>
                {mode === 'phone' ? (
                  <PhoneInput
                    value={to}
                    onChange={(val) => setTo(val)}
                    placeholder="+1 (555) 123-4567"
                    disablePortal
                  />
                ) : (
                  <Command className="border rounded-md shadow-sm">
                    <CommandInput placeholder="Search contacts..." />
                    <CommandList className="max-h-40 sm:max-h-60 overflow-y-auto overscroll-contain">
                      <CommandEmpty>No contacts found.</CommandEmpty>
                      {contacts?.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={`${c.label} ${c.number}`}
                          onSelect={() => {
                            setSelectedContactId(c.id);
                            setTo(c.number);
                            setToName((prev) => prev || c.label || '');
                          }}
                          className={clsx(
                            'cursor-pointer text-xs sm:text-sm',
                            selectedContactId === c.id &&
                              'bg-accent text-accent-foreground'
                          )}
                        >
                          <div className="min-w-0">
                            <p className="font-medium truncate">{c.label}</p>
                            <p className="text-muted-foreground text-xs">
                              {c.number}
                            </p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                )}
              </div>

              <div className="grid gap-2">
                <Label className="text-sm">From Name</Label>
                <Input
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  placeholder="Your name"
                  className="text-sm"
                />
              </div>

              <div className="grid gap-2">
                <Label className="text-sm">To Name</Label>
                <Input
                  value={toName}
                  onChange={(e) => setToName(e.target.value)}
                  placeholder={selectedContact?.label || 'Recipient name'}
                  className="text-sm"
                />
              </div>

              <div className="grid gap-2">
                <Label className="text-sm">Subject</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject"
                  className="text-sm"
                />
              </div>

              <div className="grid gap-2">
                <Label className="text-sm">PDF Attachment</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="w-full sm:w-auto text-xs sm:text-sm"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Upload PDF
                      </>
                    )}
                  </Button>
                  {attachedFile && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={removeFile}
                      className="w-full sm:w-auto text-xs sm:text-sm"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Remove
                    </Button>
                  )}
                </div>

                {!!fileError && (
                  <p className="text-destructive text-xs sm:text-sm">
                    {fileError}
                  </p>
                )}

                {attachedFile && (
                  <div className="flex justify-between items-center mt-2 bg-muted/40 p-2 rounded-md">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="text-red-600 w-4 h-4 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm truncate">
                          {attachedFile.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(attachedFile.size)}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={removeFile}
                      className="h-8 w-8 p-0 flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="hidden lg:block overflow-auto border rounded-md p-3 sm:p-4 bg-muted/30">
              <Label className="mb-2 block text-sm">Cover Page Preview</Label>
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                {`----------------------------------------
FAX COVER
----------------------------------------

Date:        ${new Date().toLocaleDateString()}

From:        ${fromName || '[Your Name]'}
Fax:         ${activeNumber?.number || '[Fax #]'}
To:          ${toName || '[Recipient Name]'}
Subject:     ${subject || '[Subject]'}

----------------------------------------
CONFIDENTIALITY NOTICE:
This fax may contain confidential information 
intended only for the recipient. If you are not 
the intended recipient, please notify the sender 
and destroy this document.
----------------------------------------`}
              </pre>
            </div>

            <div className="lg:hidden">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCoverPreview(!showCoverPreview)}
                className="w-full text-xs sm:text-sm"
              >
                {showCoverPreview ? 'Hide' : 'Show'} Cover Preview
              </Button>
              {showCoverPreview && (
                <div className="mt-3 overflow-auto border rounded-md p-3 sm:p-4 bg-muted/30 max-h-64">
                  <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                    {`----------------------------------------
FAX COVER
----------------------------------------

Date:        ${new Date().toLocaleDateString()}

From:        ${fromName || '[Your Name]'}
Fax:         ${activeNumber?.number || '[Fax #]'}
To:          ${toName || '[Recipient Name]'}
Subject:     ${subject || '[Subject]'}

----------------------------------------
CONFIDENTIALITY NOTICE:
This fax may contain confidential information 
intended only for the recipient. If you are not 
the intended recipient, please notify the sender 
and destroy this document.
----------------------------------------`}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="px-4 sm:px-6 py-3 border-t sticky bottom-0 bg-background flex-shrink-0">
          <div className="flex w-full gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSending}
              className="flex-1 sm:flex-none text-xs sm:text-sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={!isFormValid || isSending}
              className="flex-1 sm:flex-none text-xs sm:text-sm"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Fax'
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
