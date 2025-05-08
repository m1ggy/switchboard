'use client';

import { ChevronsUpDown, Plus } from 'lucide-react';
import * as React from 'react';

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
import NumberWithCopy from './number-copy';

export function NumberSwitcher({
  numbers,
}: {
  numbers: {
    number: string;
    label: string;
  }[];
}) {
  const { isMobile } = useSidebar();
  const [activeNumber, setActiveNumber] = React.useState(numbers[0]);

  if (!activeNumber) {
    return null;
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
                  {activeNumber.label}
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
            {numbers.map((number, index) => (
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
            <DropdownMenuItem className="gap-2 p-2">
              <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                <Plus className="size-4" />
              </div>
              <div className="font-medium text-muted-foreground">
                Add Number
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
