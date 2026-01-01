import { useTwilioVoice } from '@/hooks/twilio-provider';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { GetUserCompaniesOutput } from 'api/trpc/types';
import clsx from 'clsx';
import { formatDate } from 'date-fns';
import { Check, ChevronLeft, X } from 'lucide-react';

import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardTitle } from './ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import Loader from './ui/loader';

function CompanySwitcherDialog() {
  const {
    companySwitcherDialogShown,
    setCompanySwitcherDialogShown,
    activeCompany,
    setActiveCompany,
    setActiveNumber,
  } = useMainStore();

  const trpc = useTRPC();

  // ✅ NEW: access twilio lifecycle helpers
  const { destroyClient, setTokenOverride } = useTwilioVoice();

  const { data: companies, isFetching } = useQuery({
    ...trpc.companies.getUserCompanies.queryOptions(),
    refetchOnWindowFocus: false,
  });

  const { mutateAsync: mutatePresence } = useMutation(
    trpc.twilio.presence.mutationOptions()
  );

  const onSelectCompany = async (company: GetUserCompaniesOutput) => {
    const { numbers, ...baseCompany } = company;

    setActiveCompany(baseCompany);

    if (!numbers.length) {
      setCompanySwitcherDialogShown(false);
      return;
    }

    const mainNumber = numbers[0];

    // ✅ 1) Destroy old device first so we don't miss calls or double-register
    destroyClient();

    // ✅ 2) Update store with new identity
    setActiveNumber(mainNumber);

    // ✅ 3) Ping presence for new identity
    await mutatePresence({ identity: mainNumber.number });

    // ✅ 4) Fetch the token for the NEW identity (not activeNumber!)
    const newToken = await trpc.twilio.token.fetch({
      identity: mainNumber.number,
    });

    // ✅ 5) Apply token immediately so provider initializes right away
    setTokenOverride(newToken);

    setCompanySwitcherDialogShown(false);
  };

  return (
    <Dialog
      open={companySwitcherDialogShown}
      onOpenChange={setCompanySwitcherDialogShown}
    >
      <DialogContent
        className={clsx(
          'p-0 sm:p-6 sm:max-w-lg',
          'sm:rounded-lg',
          'h-[92dvh] sm:h-auto',
          'overflow-hidden'
        )}
      >
        {/* Mobile header */}
        <div
          className="sm:hidden sticky top-0 z-10 flex items-center justify-between px-3 py-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
          style={{ paddingTop: 'max(env(safe-area-inset-top),0px)' }}
        >
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="-ml-1"
              onClick={() => setCompanySwitcherDialogShown(false)}
              aria-label="Close"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="font-semibold">Switch Company</span>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close dialog">
              <X className="h-5 w-5" />
            </Button>
          </DialogClose>
        </div>

        {/* Desktop header */}
        <DialogHeader className="hidden sm:block">
          <DialogTitle>Switch Company</DialogTitle>
          <DialogDescription>Switch from the current company</DialogDescription>
        </DialogHeader>

        {/* Content */}
        <div className="px-3 sm:px-0 pb-3 sm:pb-0">
          <div
            className={clsx(
              'overflow-y-auto',
              'max-h-[unset] sm:max-h-[60vh]',
              'h-[calc(92dvh-56px)] sm:h-auto'
            )}
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom),0px)' }}
          >
            {isFetching ? (
              <div className="flex justify-center items-center py-16">
                <Loader />
              </div>
            ) : companies && companies.length ? (
              <div className="flex flex-col gap-3 sm:gap-4">
                {companies.map((company) => {
                  const disabled = company.numbers.length === 0;
                  const isActive = activeCompany?.id === company.id;

                  return (
                    <Card
                      key={company.id}
                      onClick={() =>
                        !disabled ? onSelectCompany(company) : null
                      }
                      role="button"
                      tabIndex={disabled ? -1 : 0}
                      aria-disabled={disabled}
                      className={clsx(
                        'transition-colors select-none',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        disabled
                          ? 'bg-muted text-muted-foreground opacity-60 cursor-not-allowed pointer-events-none'
                          : 'hover:bg-accent cursor-pointer',
                        isActive && 'bg-accent'
                      )}
                    >
                      <CardContent className="py-4 px-4 sm:py-5 sm:px-6">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <CardTitle className="text-base sm:text-lg truncate">
                              {company.name}
                            </CardTitle>
                            <CardDescription className="mt-0.5 text-xs sm:text-sm">
                              {company.created_at &&
                                formatDate(company.created_at, 'd MMM yyyy')}
                            </CardDescription>
                            <div className="mt-2">
                              {company.numbers.length === 0 ? (
                                <span className="text-muted-foreground text-xs sm:text-sm font-medium">
                                  No active numbers
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-xs sm:text-sm font-medium">
                                  {company.numbers.length} number
                                  {company.numbers.length > 1 && 's'}
                                </span>
                              )}
                            </div>
                          </div>

                          {isActive && (
                            <Check className="h-5 w-5 shrink-0 mt-0.5" />
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Found no companies.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CompanySwitcherDialog;
