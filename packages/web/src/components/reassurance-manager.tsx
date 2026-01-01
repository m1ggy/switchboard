'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState } from 'react';
import ContactForm from './contact-form';
import ProfileForm from './profile-form';
import ScheduleForm from './schedule-form';

export default function ReassuranceManager() {
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null
  );
  const [activeTab, setActiveTab] = useState('contact');

  const handleContactCreated = (contactId: string) => {
    setSelectedContactId(contactId);
    setActiveTab('profile');
  };

  const handleProfileCreated = () => {
    setActiveTab('schedule');
  };

  return (
    <div className="container py-8 mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-balance">
          Reassurance Call Management
        </h1>
        <p className="text-muted-foreground mt-2">
          Create profiles and schedule reassurance calls for your contacts
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full max-w-4xl"
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="contact">Contact</TabsTrigger>
          <TabsTrigger value="profile" disabled={!selectedContactId}>
            Profile
          </TabsTrigger>
          <TabsTrigger value="schedule" disabled={!selectedContactId}>
            Schedule
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contact" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Select or Create Contact</CardTitle>
              <CardDescription>
                Choose an existing contact or create a new one
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ContactForm onContactCreated={handleContactCreated} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create Contact Profile</CardTitle>
              <CardDescription>
                Add profile information for {selectedContactId}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedContactId && (
                <ProfileForm
                  contactId={selectedContactId}
                  onProfileCreated={handleProfileCreated}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create Schedule</CardTitle>
              <CardDescription>
                Set up reassurance call schedule
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedContactId && (
                <ScheduleForm contactId={selectedContactId} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
