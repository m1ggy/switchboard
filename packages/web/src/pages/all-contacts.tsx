import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDistanceToNow } from 'date-fns';
import { useMemo, useState } from 'react';

// Simulated contact data — replace this with real data from an API or store
const sampleContacts = [
  {
    id: '1',
    name: 'John Smith',
    number: '+1234567890',
    created_at: '2024-12-01T10:00:00Z',
  },
  {
    id: '2',
    name: 'Alice Tan',
    number: '+639178888888',
    created_at: '2025-04-15T12:45:00Z',
  },
];

function AllContacts() {
  const [search, setSearch] = useState('');
  const [contacts] = useState(sampleContacts);

  const filteredContacts = useMemo(() => {
    return contacts.filter((c) =>
      [c.name.toLowerCase(), c.number.toLowerCase()].some((val) =>
        val.includes(search.toLowerCase())
      )
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
          {filteredContacts.length > 0 ? (
            filteredContacts.map((contact) => (
              <TableRow key={contact.id}>
                <TableCell>{contact.name}</TableCell>
                <TableCell>{contact.number}</TableCell>
                <TableCell>
                  {formatDistanceToNow(new Date(contact.created_at), {
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
                      <DropdownMenuItem>Call</DropdownMenuItem>
                      <DropdownMenuItem>Message</DropdownMenuItem>
                      <DropdownMenuItem>Edit</DropdownMenuItem>
                      <DropdownMenuItem className="text-red-500">
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={4}
                className="text-center text-muted-foreground"
              >
                No contacts found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default AllContacts;
