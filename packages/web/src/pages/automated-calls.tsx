'use client';

import SetupForm from '@/components/create-scheduled-call-dialog';
import EditDialog from '@/components/edit-scheduled-call-dialog';
import CallLog from '@/components/scheduled-call-logs';
import ActiveCalls from '@/components/scheduled-calls';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, FileText, History, Phone, Plus } from 'lucide-react';
import { useState } from 'react';

export default function AutomatedCalls() {
  const [editingCall, setEditingCall] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [view, setView] = useState<'overview' | 'setup' | 'logs'>('overview');
  const [calls, setCalls] = useState([]);
  const [callLogs, setCallLogs] = useState([]);

  const handleAddCall = (newCall: any) => {
    setCalls([...calls, { ...newCall, id: Date.now(), status: 'active' }]);
    setView('overview');
  };

  const handleEditClick = (call: any) => {
    setEditingCall(call);
    setIsEditDialogOpen(true);
  };

  const handleEditSave = (updatedData: any) => {
    setCalls(
      calls.map((call) =>
        call.id === editingCall.id ? { ...call, ...updatedData } : call
      )
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-foreground">
                Automated Reassurance Calls
              </h1>
            </div>
            <nav className="flex gap-2">
              <Button
                variant={view === 'overview' ? 'default' : 'outline'}
                onClick={() => setView('overview')}
                size="sm"
              >
                Overview
              </Button>
              <Button
                variant={view === 'setup' ? 'default' : 'outline'}
                onClick={() => setView('setup')}
                size="sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Call
              </Button>
              <Button
                variant={view === 'logs' ? 'default' : 'outline'}
                onClick={() => setView('logs')}
                size="sm"
              >
                <History className="w-4 h-4 mr-2" />
                Logs
              </Button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {view === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Phone className="w-4 h-4 text-primary" />
                    Active Calls
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {calls.filter((c) => c.status === 'active').length}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Running schedules
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    Next Call
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">--:--</div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Time until next scheduled
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    Scripts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">5</div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Templates available
                  </p>
                </CardContent>
              </Card>
            </div>

            <ActiveCalls calls={calls} setCalls={setCalls} />
          </div>
        )}

        {view === 'setup' && <SetupForm onSubmit={handleAddCall} />}

        {view === 'logs' && <CallLog logs={callLogs} />}

        <EditDialog
          call={editingCall}
          isOpen={isEditDialogOpen}
          onClose={() => setIsEditDialogOpen(false)}
          onSave={handleEditSave}
        />
      </main>
    </div>
  );
}
