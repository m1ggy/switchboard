import EditContactDialog from '@/components/edit-contact-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import Loader from '@/components/ui/loader';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTwilioVoice } from '@/hooks/twilio-provider';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import type { Contact } from 'api/types/db';
import { formatDistanceToNow } from 'date-fns';
import { useMemo, useState } from 'react';

function AllContacts() {
  const trpc = useTRPC();
  const { makeCall } = useTwilioVoice();
  const [openEditContact, setOpenEditContact] = useState(false);
  const [selectedContact, setSelectedContact] =
    useState<Partial<Contact> | null>(null);
  const { activeCompany, activeNumber } = useMainStore();
  const { data: contacts, isLoading } = useQuery(
    trpc.contacts.getCompanyContacts.queryOptions({
      companyId: activeCompany?.id as string,
    })
  );
  const [search, setSearch] = useState('');

  const filteredContacts = useMemo(() => {
    return (
      (contacts ?? [])?.filter((c) =>
        [c.label.toLowerCase(), c.number.toLowerCase()].some((val) =>
          val.includes(search.toLowerCase())
        )
      ) ?? []
    );
  }, [contacts, search]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">All Contacts</h2>
        <Input
          placeholder="Search by name or number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Phone Number</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {filteredContacts?.length > 0 ? (
            filteredContacts?.map((contact) => (
              <TableRow key={contact.id}>
                <TableCell>{contact.label}</TableCell>
                <TableCell>{contact.number}</TableCell>
                <TableCell>
                  {contact.created_at &&
                    formatDistanceToNow(new Date(contact.created_at), {
                      addSuffix: true,
                    })}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        ⋮
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          makeCall({
                            To: contact.number,
                            CallerId: activeNumber?.number as string,
                          });
                        }}
                      >
                        Call
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled>Message</DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setOpenEditContact(true);
                          setSelectedContact(contact as Contact);
                        }}
                      >
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-red-500" disabled>
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          ) : !isLoading ? (
            <TableRow>
              <TableCell
                colSpan={4}
                className="text-center text-muted-foreground"
              >
                No contacts found.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      {isLoading && (
        <div className="flex h-[300px] justify-center items-center w-full gap-2">
          {' '}
          <Loader />
          <span className="text-muted-foreground text-sm font-semibold">
            Loading Contacts
          </span>
        </div>
      )}

      <EditContactDialog
        open={openEditContact}
        onOpenChange={setOpenEditContact}
        selectedContact={selectedContact as Contact}
      />
    </div>
  );
}

export default AllContacts;
