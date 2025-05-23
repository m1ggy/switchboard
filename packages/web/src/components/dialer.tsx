'use client';

import { useTwilioVoice } from '@/hooks/twilio-provider';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { Phone, X } from 'lucide-react';
import { useState } from 'react';

import clsx from 'clsx';
import { Button } from './ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from './ui/command';
import { PhoneInput } from './ui/phone-input';

const buttons = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '*',
  '0',
  '#',
  '+',
  '',
  '<',
];

function Dialer() {
  const [mode, setMode] = useState<'phone' | 'contact'>('phone');
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
    if (digit === '<') {
      setNumber((prev) => prev?.slice(0, -1));
      setSelectedContactId(null); // clear contact selection on manual input

      return;
    }
    setNumber((prev) => prev + digit);
    setSelectedContactId(null); // clear contact selection on manual input
  };

  const selectedContact = contacts?.find((c) => c.id === selectedContactId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 mb-2">
        <Button
          type="button"
          variant={mode === 'phone' ? 'default' : 'outline'}
          onClick={() => setMode('phone')}
        >
          Phone Number
        </Button>
        <Button
          type="button"
          variant={mode === 'contact' ? 'default' : 'outline'}
          onClick={() => setMode('contact')}
        >
          From Contacts
        </Button>
      </div>

      {selectedContactId && selectedContact && (
        <div className="flex items-center justify-between text-sm text-green-600 font-medium px-1">
          <span>
            {selectedContact.label} — {selectedContact.number}
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

      {!number && contacts && mode === 'contact' && (
        <Command className="border rounded-md shadow-sm">
          <CommandInput placeholder="Search contacts..." />
          <CommandList>
            <CommandEmpty>No contacts found.</CommandEmpty>
            {contacts.map((contact) => (
              <CommandItem
                key={contact.number}
                value={contact.number}
                onSelect={() => {
                  setSelectedContactId(contact.id);
                }}
                className={clsx(
                  'cursor-pointer',
                  selectedContactId == contact.id &&
                    ' bg-accent text-accent-foreground'
                )}
              >
                <div>
                  <p className="font-medium">{contact.label}</p>
                  <p className="text-muted-foreground text-sm">
                    {contact.number}
                  </p>
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      )}

      {!selectedContactId && mode === 'phone' && (
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
