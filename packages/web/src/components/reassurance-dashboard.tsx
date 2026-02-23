import { useMemo, useState } from 'react';
import { Link } from 'react-router';

import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';

import { useMutation, useQuery } from '@tanstack/react-query';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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

  // ✅ Delete schedule confirmation dialog state
  const [showDeleteSchedule, setShowDeleteSchedule] = useState(false);
  const [scheduleToDelete, setScheduleToDelete] = useState<Schedule | null>(
    null
  );

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

  // ✅ Delete schedule mutation
  const deleteScheduleMutation = useMutation(
    trpc.reassuranceContactProfiles.deleteSchedule.mutationOptions()
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

  const openDeleteScheduleDialog = (schedule: Schedule) => {
    setScheduleToDelete(schedule);
    setShowDeleteSchedule(true);
  };

  const confirmDeleteSchedule = async () => {
    if (!scheduleToDelete) return;

    try {
      await deleteScheduleMutation.mutateAsync({ id: scheduleToDelete.id });
      setShowDeleteSchedule(false);
      setScheduleToDelete(null);
      await refetch();
    } catch (err) {
      console.error('[Dashboard] delete schedule failed', err);
    }
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
                      {/* ✅ Add Schedule */}
                      <button
                        onClick={() => {
                          const newSchedule: Schedule = {
                            id: 0,
                            phone_number: contact.number,
                            name:
                              profile?.preferred_name ??
                              contact.label ??
                              'New Schedule',
                            frequency: 'daily',
                            is_active: true,
                            emergency_contact_name: null,
                            selected_days: null,
                            frequency_time: null,
                          };

                          setEditingSchedule(newSchedule);
                          setEditingContact(contact);
                          setShowEditSchedule(true);
                        }}
                        className="p-1 hover:bg-muted rounded-md transition-colors"
                        title="Add schedule"
                        aria-label="Add schedule"
                      >
                        <Plus className="w-4 h-4" />
                      </button>

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
                        title="Edit profile"
                        aria-label="Edit profile"
                      >
                        <Edit className="w-4 h-4" />
                      </button>

                      {/* Delete Profile */}
                      <button
                        onClick={() => handleDeleteProfile(contact.id)}
                        className="p-1 hover:bg-destructive/10 rounded-md transition-colors"
                        title="Delete profile"
                        aria-label="Delete profile"
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
                                title="Edit schedule"
                                aria-label="Edit schedule"
                              >
                                <Edit className="w-3 h-3" />
                              </button>

                              {/* ✅ Delete Schedule (with confirmation) */}
                              <button
                                onClick={() =>
                                  openDeleteScheduleDialog(schedule)
                                }
                                className="p-1 hover:bg-destructive/10 rounded transition-colors"
                                title="Delete schedule"
                                aria-label="Delete schedule"
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

      {/* ✅ Delete Schedule Confirmation */}
      <AlertDialog
        open={showDeleteSchedule}
        onOpenChange={(open) => {
          setShowDeleteSchedule(open);
          if (!open) setScheduleToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{' '}
              <span className="font-medium">
                {scheduleToDelete?.name ?? 'this schedule'}
              </span>
              . This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteScheduleMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDeleteSchedule();
              }}
              disabled={deleteScheduleMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteScheduleMutation.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Profile */}
      {editingProfile && (
        <EditProfileDialog
          open={showEditProfile}
          onOpenChange={(open) => {
            setShowEditProfile(open);
            if (!open) setEditingProfile(null);
          }}
          profile={editingProfile}
          onSuccess={async () => {
            setShowEditProfile(false);
            setEditingProfile(null);
            await refetch();
          }}
        />
      )}

      {/* Edit Schedule */}
      {editingSchedule && editingContact && (
        <EditScheduleDialog
          open={showEditSchedule}
          onOpenChange={(open) => {
            setShowEditSchedule(open);
            if (!open) {
              setEditingSchedule(null);
              setEditingContact(null);
            }
          }}
          schedule={editingSchedule}
          contact={editingContact}
          onSuccess={async () => {
            setShowEditSchedule(false);
            setEditingSchedule(null);
            setEditingContact(null);
            await refetch();
          }}
        />
      )}
    </div>
  );
}
