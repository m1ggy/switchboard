import { useMemo, useState } from 'react';
import { Link } from 'react-router';

import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';

import { useQuery } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Edit, Eye, Phone, Plus, Trash2 } from 'lucide-react';

import EditProfileDialog from './edit-profile-dialog';
import EditScheduleDialog from './edit-schedule-dialog';

interface Contact {
  id: string;
  number: string;
  label: string;
  created_at: string;
  company_id: string;
}

interface Profile {
  contact_id: string;
  preferred_name: string | null;
  timezone: string | null;
  locale: string | null;
  medical_notes: string | null;
  goals: string | null;
  risk_flags: string[] | null;
}

interface Schedule {
  id: number;
  phone_number: string;
  name: string;
  frequency: string;
  is_active: boolean;
  emergency_contact_name?: string | null;
  selected_days?: string[] | null;
  frequency_time?: string | null;
}

type Row = {
  contact: Contact;
  profile: Profile | null;
  schedules: Schedule[];
};

export default function Dashboard({
  onCreateClick,
}: {
  onCreateClick: () => void;
}) {
  const trpc = useTRPC();
  const { activeCompany } = useMainStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showEditSchedule, setShowEditSchedule] = useState(false);

  /**
   * ✅ Fetch Contact + Profile + Schedules[]
   */
  const { data, isLoading, refetch } = useQuery(
    trpc.reassuranceContactProfiles.getAllWithSchedulesByCompanyId.queryOptions(
      {
        companyId: activeCompany?.id as string,
      }
    )
  );

  const rows: Row[] = (data ?? []) as any;

  /**
   * ✅ Filter list based on search query
   */
  const filteredRows = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return rows;

    return rows.filter((row) => {
      const contact = row.contact;
      const profile = row.profile;

      return (
        (profile?.preferred_name ?? '').toLowerCase().includes(query) ||
        (profile?.timezone ?? '').toLowerCase().includes(query) ||
        (contact?.label ?? '').toLowerCase().includes(query) ||
        (contact?.number ?? '').toLowerCase().includes(query)
      );
    });
  }, [rows, searchQuery]);

  const handleDeleteProfile = async (contactId: string) => {
    console.log('Delete profile:', contactId);
    // if you add delete endpoint later, call it here
    // await refetch()
  };

  const handleDeleteSchedule = async (scheduleId: number) => {
    console.log('Delete schedule:', scheduleId);
    // if you add delete schedule endpoint later, call it here
    // await refetch()
  };

  return (
    <div className="container py-8 mx-auto px-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-balance">Reassurance Calls</h1>
          <p className="text-muted-foreground mt-2">
            Manage profiles and schedules
          </p>
        </div>
        <Button onClick={onCreateClick} size="lg" className="gap-2">
          <Plus className="w-4 h-4" />
          New Profile
        </Button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <Input
          placeholder="Search by name, timezone, label, or phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md"
        />
      </div>

      {/* Loading */}
      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Loading profiles…
          </CardContent>
        </Card>
      ) : filteredRows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Phone className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground mb-4">No profiles yet</p>
            <Button onClick={onCreateClick} variant="outline">
              Create your first profile
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredRows.map((row) => {
            const contact = row.contact;
            const profile = row.profile;
            const schedules = row.schedules ?? [];

            return (
              <Card key={contact.id} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle>
                        {profile?.preferred_name ?? contact.label}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-1 mt-1">
                        <Phone className="w-3 h-3" />
                        {contact.number}
                      </CardDescription>
                    </div>

                    <div className="flex gap-2">
                      {/* Edit Profile */}
                      <button
                        onClick={() => {
                          setEditingProfile(
                            profile ?? {
                              contact_id: contact.id,
                              preferred_name: contact.label,
                              timezone: null,
                              locale: null,
                              medical_notes: null,
                              goals: null,
                              risk_flags: [],
                            }
                          );
                          setShowEditProfile(true);
                        }}
                        className="p-1 hover:bg-muted rounded-md transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>

                      {/* Delete Profile */}
                      <button
                        onClick={() => handleDeleteProfile(contact.id)}
                        className="p-1 hover:bg-destructive/10 rounded-md transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 space-y-3 pb-3">
                  {/* Timezone */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase">
                      Location
                    </p>
                    <p className="text-sm">{profile?.timezone ?? '—'}</p>
                  </div>

                  {/* Risk Flags */}
                  {Array.isArray(profile?.risk_flags) &&
                    profile.risk_flags.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                          Risk Flags
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {profile.risk_flags.map((flag) => (
                            <Badge
                              key={flag}
                              variant="outline"
                              className="text-xs"
                            >
                              {flag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Schedules */}
                  {schedules.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                        Schedules ({schedules.length})
                      </p>

                      <div className="space-y-1">
                        {schedules.map((schedule) => (
                          <div
                            key={schedule.id}
                            className="flex items-center justify-between bg-muted p-2 rounded text-sm"
                          >
                            <div className="flex-1">
                              <p className="font-medium">{schedule.name}</p>
                              <p className="text-xs text-muted-foreground capitalize">
                                {schedule.frequency} •{' '}
                                {schedule.frequency_time ?? '—'} UTC
                              </p>
                            </div>

                            <div className="flex gap-1">
                              {schedule.is_active && (
                                <Badge className="text-xs">Active</Badge>
                              )}

                              <Link
                                to={`/dashboard/automated-calls/logs?contact=${contact.id}&name=${encodeURIComponent(
                                  profile?.preferred_name ??
                                    contact.label ??
                                    'Call Logs'
                                )}&schedule=${schedule.id}&scheduleName=${encodeURIComponent(schedule.name)}`}
                                className="p-1 hover:bg-background rounded transition-colors"
                              >
                                <Eye className="w-3 h-3" />
                              </Link>

                              <button
                                onClick={() => {
                                  setEditingSchedule(schedule);
                                  setEditingContact(contact);
                                  setShowEditSchedule(true);
                                }}
                                className="p-1 hover:bg-background rounded transition-colors"
                              >
                                <Edit className="w-3 h-3" />
                              </button>

                              <button
                                onClick={() =>
                                  handleDeleteSchedule(schedule.id)
                                }
                                className="p-1 hover:bg-destructive/10 rounded transition-colors"
                              >
                                <Trash2 className="w-3 h-3 text-destructive" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Profile */}
      {editingProfile && (
        <EditProfileDialog
          open={showEditProfile}
          onOpenChange={setShowEditProfile}
          profile={editingProfile}
          onSuccess={async () => {
            setShowEditProfile(false);
            await refetch();
          }}
        />
      )}

      {/* Edit Schedule */}
      {editingSchedule && editingContact && (
        <EditScheduleDialog
          open={showEditSchedule}
          onOpenChange={setShowEditSchedule}
          schedule={editingSchedule}
          onSuccess={async () => {
            setShowEditSchedule(false);
            await refetch();
          }}
          contact={editingContact}
        />
      )}
    </div>
  );
}
