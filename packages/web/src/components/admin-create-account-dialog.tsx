import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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

/**
 * AdminCreateAccountDialog
 * ------------------------
 * Internal tool: provision an account (company + owner link + number) for
 * ANY user, on a number already purchased outside this app, with no payment
 * required. Server-side gated to a single allowed email (superAdminProcedure)
 * — this dialog should only ever be rendered for that same email; the
 * client-side check is UX only, not the security boundary.
 */

const Schema = z.object({
  companyName: z.string().min(2, 'Company name must be at least 2 characters'),
  userId: z.string().min(1, "Owner's Firebase user ID is required"),
  number: z
    .string()
    .min(1, 'Phone number is required')
    .regex(/^\+[1-9]\d{6,14}$/, 'Use E.164 format, e.g. +15551234567'),
  label: z.string().optional(),
  wireWebhooks: z.boolean(),
});

type FormValues = z.infer<typeof Schema>;

export default function AdminCreateAccountDialog() {
  const trpc = useTRPC();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      companyName: '',
      userId: '',
      number: '',
      label: '',
      wireWebhooks: true,
    },
    mode: 'onChange',
  });

  const { mutateAsync, isPending } = useMutation(
    trpc.companies.createAccountForUser.mutationOptions()
  );

  async function onSubmit(values: FormValues) {
    setError(null);

    try {
      await mutateAsync({
        companyName: values.companyName.trim(),
        userId: values.userId.trim(),
        number: values.number.trim(),
        label: values.label?.trim() || undefined,
        wireWebhooks: values.wireWebhooks,
      });

      await qc.invalidateQueries({
        queryKey: trpc.companies.getUserCompanies.queryOptions().queryKey,
      });

      form.reset();
      setOpen(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to create account. Please try again.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ShieldCheck className="mr-2 h-4 w-4" /> Create account (admin)
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create account for a user</DialogTitle>
          <DialogDescription>
            Provisions a company, links it to the given user, and attaches an
            already-purchased number. No payment required.
          </DialogDescription>
        </DialogHeader>

        <Card className="border-0 shadow-none">
          <CardContent className="px-0">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-5"
                autoComplete="off"
              >
                <FormField
                  control={form.control}
                  name="companyName"
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

                <FormField
                  control={form.control}
                  name="userId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Owner's Firebase user ID</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. fEK3n...uid" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone number (already purchased)</FormLabel>
                      <FormControl>
                        <Input placeholder="+15551234567" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="label"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Number label (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Main line" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="wireWebhooks"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">
                        Point this number's Twilio webhooks at this app
                      </FormLabel>
                    </FormItem>
                  )}
                />

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
                    disabled={!form.formState.isValid || isPending}
                  >
                    {isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Create account
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
