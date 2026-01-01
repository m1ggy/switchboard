'use client';

import CreateDialog from '@/components/create-profile-dialog';
import Dashboard from '@/components/reassurance-dashboard';
import { useState } from 'react';

export default function Home() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleCreateSuccess = () => {
    setShowCreateDialog(false);
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <main className="min-h-screen bg-background">
      <Dashboard
        key={refreshKey}
        onCreateClick={() => setShowCreateDialog(true)}
      />
      <CreateDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={handleCreateSuccess}
      />
    </main>
  );
}
