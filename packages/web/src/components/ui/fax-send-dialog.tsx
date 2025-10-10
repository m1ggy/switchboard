'use client';

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
import { useQuery } from '@tanstack/react-query'; // NEW
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

  // Contacts for the picker — UPDATED to match your SendMessageDialog style
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
      return;
    }
    if (file.size > MAX_SIZE) {
      setFileError('File must be under 50MB.');
      return;
    }
    const protectedPdf = await isPdfPasswordProtected(file);
    if (protectedPdf) {
      setFileError('Password-protected PDFs cannot be uploaded.');
      return;
    }

    setFileError('');
    setIsUploading(true);

    setTimeout(() => {
      setAttachedFile({
        file,
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        size: file.size,
      });
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }, 800);
  };

  const removeFile = () => setAttachedFile(null);
  const formatFileSize = (bytes: number) =>
    `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

  const isFormValid =
    fromName.trim() &&
    toName.trim() &&
    to.trim() &&
    subject.trim() &&
    attachedFile;

  const handleSend = async () => {
    if (!isFormValid) return;
    setIsSending(true);

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
      headers: { Authorization: `Bearer ${token}` },
    });

    setIsSending(false);
    setAttachedFile(null);
    setFromName('');
    setSubject('');
    setTo('');
    setToName('');
    setSelectedContactId(null);
    setMode('phone');

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

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[80vw] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Send Fax</DialogTitle>
          <DialogDescription>
            Fill out the fields and attach a PDF to send.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto max-h-[70vh] px-1">
          {/* Left column: Lean form */}
          <div className="space-y-4 pr-2">
            {/* Mode toggle, same pattern as SendMessageDialog */}
            <div className="flex gap-2">
              <Button
                type="button"
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
                variant={mode === 'contact' ? 'default' : 'outline'}
                onClick={() => setMode('contact')}
              >
                From Contacts
              </Button>
            </div>

            {/* Show selected contact summary + Clear (like SendMessageDialog) */}
            {selectedContactId && selectedContact && (
              <div className="flex items-center justify-between text-sm text-green-600 font-medium px-1 -mb-2">
                <span>
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
                  className="text-red-500 hover:text-red-700"
                >
                  <X className="w-4 h-4 mr-1" />
                  Clear
                </Button>
              </div>
            )}

            {/* To (Fax Number) - phone vs contact mode */}
            <div className="grid gap-2">
              <Label>To (Fax Number)</Label>
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
                  <CommandList>
                    <CommandEmpty>No contacts found.</CommandEmpty>
                    {contacts?.map((c) => (
                      <CommandItem
                        key={c.id}
                        value={c.number}
                        onSelect={() => {
                          setSelectedContactId(c.id);
                          setTo(c.number);
                          setToName((prev) => prev || c.label || '');
                        }}
                        className={clsx(
                          'cursor-pointer',
                          selectedContactId === c.id &&
                            'bg-accent text-accent-foreground'
                        )}
                      >
                        <div>
                          <p className="font-medium">{c.label}</p>
                          <p className="text-muted-foreground text-sm">
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
              <Label>From Name</Label>
              <Input
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label>To Name</Label>
              <Input
                value={toName}
                onChange={(e) => setToName(e.target.value)}
                placeholder={
                  selectedContact?.label ? selectedContact.label : undefined
                }
              />
            </div>

            <div className="grid gap-2">
              <Label>Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label>PDF Attachment</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
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

              {fileError && <p className="text-red-500 text-sm">{fileError}</p>}

              {attachedFile && (
                <div className="flex justify-between items-center mt-2 bg-gray-50 p-2 rounded-md">
                  <div className="flex items-center gap-2">
                    <FileText className="text-red-600 w-4 h-4" />
                    <div>
                      <p className="text-sm">{attachedFile.name}</p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(attachedFile.size)}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={removeFile}
                    className="h-8 w-8 p-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Right column: Cover preview */}
          <div className="overflow-auto border rounded-md p-4 bg-gray-50">
            <Label className="mb-2 block">Cover Page Preview</Label>
            <pre className="whitespace-pre-wrap font-mono text-sm">
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
        </div>

        <DialogFooter className="mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSending}
          >
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!isFormValid || isSending}>
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              'Send Fax'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
