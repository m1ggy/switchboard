import { Copy } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import TooltipStandalone from './ui/tooltip-standalone';

interface NumberWithCopyProps {
  activeNumber: {
    number: string;
  };
}

const NumberWithCopy: React.FC<NumberWithCopyProps> = ({ activeNumber }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeNumber.number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  useEffect(() => {
    if (copied) {
      setTimeout(() => {
        setCopied(false);
      }, 1000);
    }
  }, [copied]);

  return (
    <div
      onClick={handleCopy}
      className="flex gap-2 items-center cursor-pointer justify-center hover:bg-accent-foreground rounded-2xl hover:text-accent transition-colors"
      title="Click to copy"
    >
      <TooltipStandalone content={'Copied!'} open={copied}>
        <span className="truncate text-md font-bold flex gap-2 items-center">
          <Copy size={14} />
          {activeNumber.number}
        </span>
      </TooltipStandalone>
    </div>
  );
};

export default NumberWithCopy;
