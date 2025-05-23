'use client';

import { ChevronsUpDown, Plus } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import useMainStore from '@/lib/store';
import NumberWithCopy from './number-copy';
import { Skeleton } from './ui/skeleton';

type Number = {
  number: string;
  label: string;
  id: string;
};

export function NumberSwitcher({
  numbers,
  isLoading,
}: {
  numbers: Number[];
  isLoading?: boolean;
  defaultValue?: Number | null;
}) {
  const { isMobile } = useSidebar();
  const { activeNumber, setActiveNumber } = useMainStore();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="w-[230px] h-[25px]" />
        <div className="flex justify-center">
          <Skeleton className="w-[200px] h-[24px]" />
        </div>
      </div>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size={null}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground p-2=4"
            >
              <div className="grid flex-1 text-left text-sm leading-tight gap-1">
                <span className="truncate font-semibold text-xs text-gray-400">
                  {activeNumber?.label}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          {activeNumber && <NumberWithCopy activeNumber={activeNumber} />}
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            align="start"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Numbers
            </DropdownMenuLabel>
            {numbers.map((number) => (
              <DropdownMenuItem
                key={number.label}
                onClick={() => setActiveNumber(number)}
                className="gap-2 p-2"
              >
                <div className="flex flex-col gap-1">
                  <p className="truncate font-semibold text-xs text-gray-400">
                    {number.label}
                  </p>
                  <p className="truncate text-sm font-bold">{number.number}</p>
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 p-2" disabled>
              <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                <Plus className="size-4" />
              </div>
              <div className="font-medium text-muted-foreground">
                Add Number (unavailable)
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
