import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Phone, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useTRPC } from '@/lib/trpc';
import { TwilioNumberSearch } from './twilio-number-search';

/**
 * CreateCompanyDialog
 * --------------------
 * Dialog for creating a company with just a name and a phone number.
 * - Integrates your TwilioNumberSearch for picking a number
 * - Validates with zod/react-hook-form
 * - Calls tRPC mutation `companies.createCompany`
 * - On success: closes, resets, invalidates user companies
 */

const CompanySchema = z.object({
  name: z
    .string()
    .min(2, 'Company name must be at least 2 characters')
    .max(100, 'Company name is too long'),
});

export type CreateCompanyValues = z.infer<typeof CompanySchema>;

type SelectedNumber = {
  phoneNumber: string;
  friendlyName?: string;
  locality?: string;
  region?: string;
  capabilities?: string[];
};

interface CreateCompanyDialogProps {
  disabled?: boolean;
  trigger?: React.ReactNode;
  onCreated?: (companyId: string) => void;
}

export default function CreateCompanyDialog({
  disabled,
  trigger,
  onCreated,
}: CreateCompanyDialogProps) {
  const trpc = useTRPC();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNumber, setSelectedNumber] = useState<SelectedNumber | null>(
    null
  );

  const form = useForm<CreateCompanyValues>({
    resolver: zodResolver(CompanySchema),
    defaultValues: { name: '' },
    mode: 'onChange',
  });

  const { mutateAsync, isPending } = useMutation(
    trpc.companies.createCompany.mutationOptions()
  );

  async function onSubmit(values: CreateCompanyValues) {
    setError(null);

    if (!selectedNumber?.phoneNumber) {
      setError('Please select a phone number.');
      return;
    }

    try {
      const payload = {
        companyName: values.name.trim(),
        number: selectedNumber.phoneNumber,
      } as any;

      const created = await mutateAsync(payload);

      await qc.invalidateQueries({
        queryKey: trpc.companies.getUserCompanies.queryOptions().queryKey,
      });

      // Reset UI
      form.reset();
      setSelectedNumber(null);
      setOpen(false);
      onCreated?.(created?.id ?? '');
    } catch (e: any) {
      const message =
        e?.message || 'Failed to create company. Please try again.';
      setError(message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button disabled={disabled}>
            <Plus className="mr-2 h-4 w-4" /> New company
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create a new company</DialogTitle>
          <DialogDescription>
            Provide a company name and select a phone number to get started.
          </DialogDescription>
        </DialogHeader>

        <Card className="border-0 shadow-none">
          <CardContent className="px-0">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
                autoComplete="off"
              >
                {/* Company name */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company name</FormLabel>
                      <FormControl>
                        <Input placeholder="Acme, Inc." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Number picker */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">
                      Choose a phone number
                    </span>
                  </div>

                  <TwilioNumberSearch
                    onNumberSelect={(num: any) => setSelectedNumber(num)}
                    selectedNumber={selectedNumber?.phoneNumber || null}
                  />

                  {selectedNumber?.phoneNumber ? (
                    <div className="flex items-center justify-between rounded-md border p-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        <span className="font-medium">
                          {selectedNumber.friendlyName ||
                            selectedNumber.phoneNumber}
                        </span>
                        {selectedNumber.capabilities?.length ? (
                          <div className="flex gap-1 ml-2">
                            {selectedNumber.capabilities!.map((cap) => (
                              <Badge
                                key={cap}
                                variant="outline"
                                className="text-xs"
                              >
                                {cap}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setSelectedNumber(null)}
                        className="h-8 px-2"
                      >
                        Change
                      </Button>
                    </div>
                  ) : null}
                </div>

                {error ? (
                  <div className="text-sm text-red-600">{error}</div>
                ) : null}

                <DialogFooter className="gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                    disabled={isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      !form.formState.isValid || !selectedNumber || isPending
                    }
                  >
                    {isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Create company
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
