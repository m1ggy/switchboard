'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Contact, Profile, Schedule } from '@/lib/schemas';
import { AlertCircle, CheckCircle2, Circle } from 'lucide-react';
import { useState } from 'react';
import ContactForm from './contact-form';
import ProfileForm from './profile-form';
import ScheduleForm from './schedule-form';

interface CreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function CreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateDialogProps) {
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(
    null
  );
  const [activeTab, setActiveTab] = useState('contact');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isContactComplete = !!selectedContact;
  const isProfileComplete = !!selectedProfile;
  const isScheduleComplete = !!selectedSchedule;
  const isAllComplete =
    isContactComplete && isProfileComplete && isScheduleComplete;

  const handleContactSubmit = async (contactData: Contact) => {
    setSelectedContact(contactData);
    setActiveTab('profile');
  };

  const handleProfileSubmit = async (profileData: Profile) => {
    setSelectedProfile(profileData);
    setActiveTab('schedule');
  };

  const handleScheduleSubmit = async (scheduleData: Schedule) => {
    setSelectedSchedule(scheduleData);
    setActiveTab('summary');
  };

  const handleFinalSubmit = async () => {
    setIsSubmitting(true);
    try {
      console.log('[v0] Final submission:', {
        contact: selectedContact,
        profile: selectedProfile,
        schedule: selectedSchedule,
      });

      handleClose();
      onSuccess();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedContact(null);
    setSelectedProfile(null);
    setSelectedSchedule(null);
    setActiveTab('contact');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      {/* ✅ dialog must be constrained + clip overflow */}
      <DialogContent className="!w-[95vw] !max-w-[1400px] max-h-[90vh] overflow-y-auto flex flex-col">
        {/* ✅ give inner padding but keep dialog clipping */}
        <div className="p-6 flex flex-col flex-1 overflow-hidden">
          <DialogHeader>
            <DialogTitle>Create New Profile</DialogTitle>
            <DialogDescription>
              Complete all steps to create a new reassurance call profile
            </DialogDescription>
          </DialogHeader>

          {/* ✅ grid must allow children to shrink */}
          <div className="grid gap-8 grid-cols-1 md:grid-cols-[240px_1fr] flex-1 overflow-hidden mt-6 min-w-0">
            {/* Sidebar */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">Setup Progress</h3>

              <div className="space-y-2">
                <button
                  onClick={() => setActiveTab('contact')}
                  className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  {isContactComplete ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="text-sm font-medium">Contact</span>
                </button>

                <button
                  onClick={() => isContactComplete && setActiveTab('profile')}
                  disabled={!isContactComplete}
                  className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProfileComplete ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="text-sm font-medium">Profile</span>
                </button>

                <button
                  onClick={() => isProfileComplete && setActiveTab('schedule')}
                  disabled={!isProfileComplete}
                  className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isScheduleComplete ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="text-sm font-medium">Schedule</span>
                </button>

                <button
                  onClick={() => isAllComplete && setActiveTab('summary')}
                  disabled={!isAllComplete}
                  className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAllComplete ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="text-sm font-medium">Summary</span>
                </button>
              </div>
            </div>

            {/* ✅ Right side MUST not overflow and MUST scroll */}
            <div className="min-w-0 overflow-hidden">
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full h-full flex flex-col min-w-0"
              >
                {/* ✅ tabs should not push width */}
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="contact">Contact</TabsTrigger>
                  <TabsTrigger value="profile" disabled={!selectedContact}>
                    Profile
                  </TabsTrigger>
                  <TabsTrigger value="schedule" disabled={!selectedContact}>
                    Schedule
                  </TabsTrigger>
                  <TabsTrigger value="summary" disabled={!isAllComplete}>
                    Summary
                  </TabsTrigger>
                </TabsList>

                {/* ✅ Content scrolls vertically inside the right panel */}
                <div className="flex-1 overflow-y-auto min-w-0">
                  <TabsContent
                    value="contact"
                    className="space-y-6 mt-4 min-w-0"
                  >
                    <ContactForm onSubmit={handleContactSubmit} />
                  </TabsContent>

                  <TabsContent
                    value="profile"
                    className="space-y-6 mt-4 min-w-0"
                  >
                    {selectedContact && (
                      <ProfileForm
                        contactId={selectedContact.id || ''}
                        initialData={selectedProfile}
                        onSubmit={handleProfileSubmit}
                        onCancel={handleClose}
                      />
                    )}
                  </TabsContent>

                  <TabsContent
                    value="schedule"
                    className="space-y-6 mt-4 min-w-0"
                  >
                    {selectedContact && (
                      <ScheduleForm
                        contactId={selectedContact.id || ''}
                        initialData={selectedSchedule}
                        onSubmit={handleScheduleSubmit}
                        onCancel={handleClose}
                      />
                    )}
                  </TabsContent>

                  <TabsContent
                    value="summary"
                    className="space-y-6 mt-4 min-w-0"
                  >
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Please review the information below before creating the
                        profile
                      </AlertDescription>
                    </Alert>

                    <div className="space-y-4">
                      <Card className="p-4">
                        <h3 className="font-semibold mb-3">
                          Contact Information
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">
                              Phone Number
                            </p>
                            <p className="font-medium">
                              {selectedContact?.number}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">
                              Label
                            </p>
                            <p className="font-medium">
                              {selectedContact?.label}
                            </p>
                          </div>
                        </div>
                      </Card>

                      <Card className="p-4">
                        <h3 className="font-semibold mb-3">Profile Details</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">
                              Preferred Name
                            </p>
                            <p className="font-medium">
                              {selectedProfile?.preferred_name}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">
                              Timezone
                            </p>
                            <p className="font-medium">
                              {selectedProfile?.timezone}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">
                              Locale
                            </p>
                            <p className="font-medium">
                              {selectedProfile?.locale}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">
                              Risk Flags
                            </p>
                            <p className="font-medium">
                              {selectedProfile?.risk_flags?.join(', ') ||
                                'None'}
                            </p>
                          </div>
                        </div>
                      </Card>

                      <Card className="p-4">
                        <h3 className="font-semibold mb-3">Schedule Details</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">
                              Schedule Name
                            </p>
                            <p className="font-medium">
                              {selectedSchedule?.name}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">
                              Frequency
                            </p>
                            <p className="font-medium capitalize">
                              {selectedSchedule?.frequency}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">
                              Caller Name
                            </p>
                            <p className="font-medium">
                              {selectedSchedule?.caller_name}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">
                              Time
                            </p>
                            <p className="font-medium">
                              {selectedSchedule?.frequency_time}
                            </p>
                          </div>

                          {selectedSchedule?.selected_days && (
                            <div className="col-span-2">
                              <p className="text-sm text-muted-foreground">
                                Days
                              </p>
                              <p className="font-medium">
                                {selectedSchedule.selected_days.join(', ')}
                              </p>
                            </div>
                          )}
                        </div>
                      </Card>
                    </div>

                    <div className="flex gap-2 justify-end pt-4 border-t">
                      <Button
                        variant="outline"
                        onClick={() => setActiveTab('schedule')}
                      >
                        Back to Schedule
                      </Button>
                      <Button
                        onClick={handleFinalSubmit}
                        disabled={isSubmitting}
                        className="gap-2"
                      >
                        {isSubmitting ? 'Creating...' : 'Create Profile'}
                      </Button>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
