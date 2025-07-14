'use client';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import * as React from 'react';

interface HoverPopoverProps {
  children: React.ReactNode;
  content: React.ReactNode;
}

function HoverPopover({ children, content }: HoverPopoverProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        asChild
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <div>{children}</div>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={8}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="z-50 rounded-md border bg-popover p-2 text-sm shadow-md"
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}

export default HoverPopover;
