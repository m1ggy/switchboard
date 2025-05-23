import { getQueryClient } from '@/App';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
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
  const { data: companies, isFetching } = useQuery(
    trpc.companies.getUserCompanies.queryOptions()
  );

  const onSelectCompany = (company: GetUserCompaniesOutput) => {
    const { numbers, ...baseCompany } = company;
    setActiveCompany(baseCompany);
    console.log('SELECTING COMPANY: ', company);

    if (numbers.length) {
      getQueryClient().invalidateQueries({
        queryKey: trpc.twilio.token.queryOptions({
          identity: activeNumber?.number as string,
        }).queryKey,
      });
      setActiveNumber(numbers[0]);
    }
    setCompanySwitcherDialogShown(false);
  };

  console.log({ companies });
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
                  {formatDate(company.created_at, 'd MMM yyyy')}
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
      </DialogContent>
    </Dialog>
  );
}

export default CompanySwitcherDialog;
