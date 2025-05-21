'use client';

import { useTwilioVoice } from '@/hooks/twilio-provider';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { Phone, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from './ui/button';
import { PhoneInput } from './ui/phone-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

const buttons = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

function Dialer() {
  const trpc = useTRPC();
  const { activeCompany } = useMainStore();

  const { data: contacts } = useQuery(
    trpc.contacts.getCompanyContacts.queryOptions({
      companyId: activeCompany?.id as string,
    })
  );

  const [number, setNumber] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null
  );

  const { makeCall } = useTwilioVoice();

  const handleCall = () => {
    let rawNumber = number;

    if (selectedContactId) {
      const selected = contacts?.find((c) => c.id === selectedContactId);
      rawNumber = selected?.number || '';
    }

    const cleaned = rawNumber.replace(/[^\d+]/g, '');
    const assumed = cleaned.startsWith('+') ? cleaned : `+1${cleaned}`;
    const parsed = parsePhoneNumberFromString(assumed);

    if (!parsed || !parsed.isValid()) {
      alert('Invalid phone number');
      return;
    }

    makeCall({ To: parsed.number, CallerId: '+12244707658' });
  };

  const handleDial = (digit: string) => {
    setNumber((prev) => prev + digit);
    setSelectedContactId(null); // clear contact selection on manual input
  };

  const selectedContact = contacts?.find((c) => c.id === selectedContactId);

  return (
    <div className="flex flex-col gap-4">
      {selectedContactId && selectedContact && (
        <div className="flex items-center justify-between text-sm text-green-600 font-medium px-1">
          <span>
            Using contact: {selectedContact.label} — {selectedContact.number}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedContactId(null)}
            className="text-red-500 hover:text-red-700"
          >
            <X className="w-4 h-4 mr-1" />
            Clear
          </Button>
        </div>
      )}

      {!number && contacts && (
        <Select
          onValueChange={(value) => {
            setSelectedContactId(value);
            setNumber(''); // ensure manual input is cleared
          }}
          value={selectedContactId ?? ''}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select contact" />
          </SelectTrigger>
          <SelectContent>
            {contacts.map((contact) => (
              <SelectItem key={contact.id} value={contact.id}>
                {contact.label} — {contact.number}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {!selectedContactId && (
        <>
          <PhoneInput
            value={number}
            onChange={(e) => {
              setNumber(e);
              setSelectedContactId(null); // clear contact if typing
            }}
            placeholder="Enter phone number"
          />

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
        </>
      )}

      <Button onClick={handleCall} disabled={!number && !selectedContactId}>
        <Phone className="mr-2 h-4 w-4" />
        Call
      </Button>
    </div>
  );
}

export default Dialer;
