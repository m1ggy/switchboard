'use client';

import type React from 'react';
import { useRef, useState } from 'react';

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
import { Textarea } from '@/components/ui/textarea';

import { isPdfPasswordProtected } from '@/lib/pdf';
import {
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  Upload,
  X,
} from 'lucide-react';

type FaxDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type AttachedFile = {
  file: File;
  id: string;
  name: string;
  size: number;
};

export default function FaxSendDialog({ open, onOpenChange }: FaxDialogProps) {
  const [recipientNumber, setRecipientNumber] = useState('');
  const [message, setMessage] = useState('');
  const [coverText, setCoverText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [fileSizeError, setFileSizeError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/rtf',
    'application/rtf',
    'image/jpeg',
    'image/png',
    'image/tiff',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];

  const MAX_TOTAL_SIZE = 30 * 1024 * 1024;

  const checkAllPdfs = async (files: File[]) => {
    for (const file of files) {
      if (file.type === 'application/pdf') {
        const isProtected = await isPdfPasswordProtected(file);
        if (isProtected) {
          setFileSizeError(
            `"${file.name}" is password-protected and cannot be uploaded.`
          );
          return false;
        }
      }
    }
    return true;
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (!files) return;

    const validFiles = Array.from(files).filter((file) =>
      allowedTypes.includes(file.type)
    );

    if (validFiles.length === 0) {
      setFileSizeError('Unsupported file type selected.');
      return;
    }

    const newTotalSize =
      attachedFiles.reduce((acc, f) => acc + f.size, 0) +
      validFiles.reduce((acc, f) => acc + f.size, 0);

    if (newTotalSize > MAX_TOTAL_SIZE) {
      setFileSizeError('Total file size must be under 30MB.');
      return;
    }

    const pdfsOk = await checkAllPdfs(validFiles);
    if (!pdfsOk) return;

    setFileSizeError('');
    setIsUploading(true);

    setTimeout(() => {
      const newFiles: AttachedFile[] = validFiles.map((file) => ({
        file,
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        size: file.size,
      }));

      setAttachedFiles((prev) => [...prev, ...newFiles]);
      setIsUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }, 1000);
  };

  const removeFile = (id: string) => {
    setAttachedFiles((prev) => prev.filter((file) => file.id !== id));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (
      Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    );
  };

  const formatRemainingSize = (bytesRemaining: number) => {
    return `${(bytesRemaining / (1024 * 1024)).toFixed(2)} MB remaining`;
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/'))
      return <FileImage className="w-4 h-4 text-blue-600" />;
    if (
      fileType === 'application/vnd.ms-excel' ||
      fileType ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
      return <FileSpreadsheet className="w-4 h-4 text-green-600" />;
    if (
      fileType === 'application/pdf' ||
      fileType.includes('word') ||
      fileType === 'text/plain' ||
      fileType.includes('rtf')
    )
      return <FileText className="w-4 h-4 text-red-600" />;
    return <File className="w-4 h-4 text-gray-600" />;
  };

  const handleSend = async () => {
    if (!recipientNumber.trim()) return;

    setIsSending(true);

    // Simulate sending fax
    setTimeout(() => {
      console.log('Sending fax to:', recipientNumber);
      console.log('Message:', message);
      console.log('Cover text:', coverText);
      console.log('Files:', attachedFiles);

      setRecipientNumber('');
      setMessage('');
      setCoverText('');
      setAttachedFiles([]);
      setIsSending(false);
      onOpenChange(false);
    }, 2000);
  };

  const isFormValid =
    recipientNumber.trim().length > 0 &&
    (message.trim().length > 0 ||
      coverText.trim().length > 0 ||
      attachedFiles.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[50vw] max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Send Fax</DialogTitle>
          <DialogDescription>
            Send a fax message with optional attachments.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-2">
          <div className="grid gap-4 py-4 pr-2">
            <div className="grid gap-2">
              <Label htmlFor="recipient">Recipient Number</Label>
              <Input
                id="recipient"
                placeholder="+1 (555) 123-4567"
                value={recipientNumber}
                onChange={(e) => setRecipientNumber(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="cover-text">Cover Page Text</Label>
              <Textarea
                id="cover-text"
                placeholder="This text will appear on the first page of your fax..."
                value={coverText}
                onChange={(e) => setCoverText(e.target.value)}
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-gray-500">
                This will be added as the first page before your attachments.
              </p>
            </div>

            <div className="grid gap-2">
              <Label>Attachments</Label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.rtf,.jpg,.jpeg,.png,.tiff,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/rtf,image/jpeg,image/png,image/tiff,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <div className="text-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="mb-2"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Files
                      </>
                    )}
                  </Button>
                  <p className="text-sm text-gray-500">
                    Supported formats: PDF, DOC, DOCX, TXT, RTF, JPG, PNG, TIFF,
                    XLS, XLSX
                  </p>
                  {fileSizeError && (
                    <p className="text-sm text-red-500 mt-1">{fileSizeError}</p>
                  )}
                  {!fileSizeError && (
                    <p className="text-xs text-gray-500 mt-1">
                      {formatRemainingSize(
                        MAX_TOTAL_SIZE -
                          attachedFiles.reduce((acc, f) => acc + f.size, 0)
                      )}
                    </p>
                  )}
                </div>
              </div>

              {attachedFiles.length > 0 && (
                <div className="mt-2">
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                    {attachedFiles.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between p-2 bg-gray-50 rounded-md"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {getFileIcon(file.file.type)}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {file.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatFileSize(file.size)}
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(file.id)}
                          className="h-8 w-8 p-0 flex-shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  {attachedFiles.length > 1 && (
                    <p className="text-xs text-gray-500 mt-1">
                      {attachedFiles.length} files attached
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSend}
            disabled={!isFormValid || isSending}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
