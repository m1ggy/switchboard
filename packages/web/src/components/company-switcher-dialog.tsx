import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { GetUserCompaniesOutput } from 'api/trpc/types';
import clsx from 'clsx';
import { formatDate } from 'date-fns';
import { Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardTitle } from './ui/card';
import {
  Dialog,
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
    activeNumber,
  } = useMainStore();

  const trpc = useTRPC();
  const { data: companies, isFetching } = useQuery({
    ...trpc.companies.getUserCompanies.queryOptions(),
    refetchOnWindowFocus: false,
  });
  const { mutateAsync: mutate } = useMutation(
    trpc.twilio.presence.mutationOptions()
  );
  const { refetch: refetchToken } = useQuery(
    trpc.twilio.token.queryOptions({
      identity: activeNumber?.number as string,
    })
  );
  const onSelectCompany = async (company: GetUserCompaniesOutput) => {
    const { numbers, ...baseCompany } = company;
    setActiveCompany(baseCompany);

    if (numbers.length) {
      const mainNumber = numbers[0];
      setActiveNumber(mainNumber);
      await mutate({ identity: mainNumber.number });
      await refetchToken();
    }
    setCompanySwitcherDialogShown(false);
  };

  return (
    <Dialog
      open={companySwitcherDialogShown}
      onOpenChange={setCompanySwitcherDialogShown}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Switch Company</DialogTitle>
          <DialogDescription>Switch from the current company</DialogDescription>
        </DialogHeader>

        <div className="overflow-y-scroll max-h-[30vh] flex flex-col gap-4">
          {isFetching ? (
            <div className="flex justify-center items-center">
              <Loader />
            </div>
          ) : companies && companies.length ? (
            companies?.map((company) => (
              <Card
                key={company.id}
                onClick={() => onSelectCompany(company)}
                className={clsx(
                  'transition-colors select-none',
                  company.numbers.length === 0
                    ? 'bg-muted text-muted-foreground opacity-50 cursor-not-allowed pointer-events-none'
                    : 'hover:bg-accent cursor-pointer',
                  activeCompany?.id === company.id && 'bg-accent'
                )}
              >
                <CardContent>
                  <CardTitle>{company.name}</CardTitle>
                  <CardDescription>
                    {company.created_at &&
                      formatDate(company.created_at, 'd MMM yyyy')}
                  </CardDescription>
                  {company.numbers.length == 0 ? (
                    <span className=" text-muted-foreground text-sm font-bold">
                      No active numbers
                    </span>
                  ) : (
                    <span className=" text-muted-foreground text-sm font-bold">
                      {company.numbers.length} number
                      {company.numbers.length > 1 && 's'}
                    </span>
                  )}
                  {company.id === activeCompany?.id && <Check />}
                </CardContent>
              </Card>
            ))
          ) : (
            <span className="text-center">Found no companies.</span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CompanySwitcherDialog;
