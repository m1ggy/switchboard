import { useTwilioVoice } from '@/hooks/use-twilio-voice';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { Phone } from 'lucide-react';
import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';

const buttons = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

function Dialer() {
  const [number, setNumber] = useState('');
  const trpc = useTRPC();
  const query = useQuery(trpc.twilio.token.queryOptions());
  const { makeCall, hangUp } = useTwilioVoice(query.data as string);

  const handleCall = () => {
    const cleaned = number.replace(/[^\d+]/g, '');

    const assumed = cleaned.startsWith('+') ? cleaned : `+1${cleaned}`;

    const parsed = parsePhoneNumberFromString(assumed);
    if (!parsed || !parsed.isValid()) {
      alert('Invalid phone number');
      return;
    }

    makeCall({ To: parsed.number });
  };

  const handleDial = (digit: string) => {
    setNumber((prev) => prev + digit);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="Enter phone number"
        />
      </div>

      <div className="grid-cols-3 grid gap-2">
        {buttons.map((dialItem) => (
          <Button
            key={dialItem}
            variant="outline"
            onClick={() => handleDial(dialItem)}
          >
            {dialItem}
          </Button>
        ))}
      </div>

      <Button onClick={handleCall}>
        <Phone className="mr-2 h-4 w-4" />
        Call
      </Button>
    </div>
  );
}

export default Dialer;
