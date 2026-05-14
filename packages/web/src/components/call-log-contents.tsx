import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Clock, User } from 'lucide-react';

import CallRecordingCard from './call-recording-card';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';

// ---------------- Types ----------------

interface CallSession {
  id: string;
  started_at: string;
  ended_at?: string | null;
  status: string;
  risk_level?: string | null;
  ai_summary?: string | null;
  notes_for_human?: string | null;
}

interface Recording {
  id: string;
  inbound_url?: string | null;
  outbound_url?: string | null;
  combined_url?: string | null;
  duration_ms?: number | null;
  meta?: { mp3?: { mixed_url?: string | null } | null } | null;
}

interface TwilioRecording {
  sid?: string | null;
  url?: string | null;
  duration?: number | null;
  channels?: string | null;
  source?: string | null;
  status?: string | null;
  callSid?: string | null;
  parentCallSid?: string | null;
}

interface Transcript {
  id: string;
  session_id: string;
  speaker: 'user' | 'assistant' | 'system';
  channel: 'inbound' | 'outbound' | 'mixed';
  transcript: string;
  start_ms: number;
  end_ms: number;
  confidence?: number | null;
}

interface CallLog {
  session: CallSession;
  schedule: {
    id: number;
    name: string;
    frequency: string;
    frequency_time: string;
    caller_name?: string | null;
  };
  recording: Recording | null;
  call_recording: TwilioRecording | null;
  transcript: {
    count: number;
    first_ms: number | null;
    last_ms: number | null;
    duration_ms: number | null;
    items?: Transcript[];
  };
}

// ---------- Helpers ----------
const useQueryParams = () => {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDurationMs = (ms?: number | null) => {
  if (!ms || ms <= 0) return 'N/A';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
};

const formatTimestampMs = (ms?: number | null) => {
  if (ms == null || ms < 0) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const getRiskLevelColor = (level?: string | null) => {
  switch (level) {
    case 'low':
      return 'bg-green-500/10 text-green-700';
    case 'medium':
      return 'bg-yellow-500/10 text-yellow-700';
    case 'high':
      return 'bg-red-500/10 text-red-700';
    default:
      return 'bg-gray-500/10 text-gray-700';
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'bg-green-500/10 text-green-700';
    case 'in_progress':
      return 'bg-blue-500/10 text-blue-700';
    case 'user_hung_up':
      return 'bg-yellow-500/10 text-yellow-700';
    case 'failed':
      return 'bg-red-500/10 text-red-700';
    default:
      return 'bg-gray-500/10 text-gray-700';
  }
};

/** Resolve the best Twilio recording object for CallRecordingCard */
function resolveTwilioRecording(log: CallLog): TwilioRecording | null {
  if (log.call_recording?.url) return log.call_recording;
  // Fall back to GCS combined/inbound as a synthesized "recording" object
  const url =
    log.recording?.combined_url ??
    (log.recording?.meta as any)?.mp3?.mixed_url ??
    log.recording?.inbound_url ??
    log.recording?.outbound_url ??
    null;
  if (!url) return null;
  return {
    url,
    duration: log.recording?.duration_ms != null
      ? Math.round(log.recording.duration_ms / 1000)
      : null,
  };
}

export default function CallLogsContent() {
  const navigate = useNavigate();
  const query = useQueryParams();
  const trpc = useTRPC();

  const contactId = query.get('contact') || '';
  const displayName = query.get('name') || 'Call Logs';

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const {
    data: callLogs,
    isLoading,
    isError,
  } = useQuery({
    ...trpc.reassuranceContactProfiles.getCallLogsByContactId.queryOptions({
      contact_id: contactId,
      limit: 50,
      include_transcript: true,
      transcript_limit: 500,
    }),
    enabled: !!contactId,
  });

  useEffect(() => {
    if (callLogs?.length && !selectedSessionId) {
      setSelectedSessionId((callLogs as any[])[0].session.id);
    }
  }, [callLogs, selectedSessionId]);

  const sessions = useMemo(
    () => (callLogs ?? []) as CallLog[],
    [callLogs]
  );

  /** Group sessions by schedule id, preserving order of first appearance */
  const scheduleGroups = useMemo(() => {
    const map = new Map<number, { scheduleName: string; logs: CallLog[] }>();
    for (const log of sessions) {
      const sid = log.schedule.id;
      if (!map.has(sid)) {
        map.set(sid, { scheduleName: log.schedule.name, logs: [] });
      }
      map.get(sid)!.logs.push(log);
    }
    return Array.from(map.entries()).map(([id, v]) => ({
      scheduleId: id,
      scheduleName: v.scheduleName,
      logs: v.logs,
    }));
  }, [sessions]);

  const selectedLog: CallLog | null = useMemo(() => {
    if (!selectedSessionId) return null;
    return sessions.find((l) => l.session.id === selectedSessionId) ?? null;
  }, [sessions, selectedSessionId]);

  const selectedTranscripts = selectedLog?.transcript?.items ?? [];

  const twilioRecording = selectedLog ? resolveTwilioRecording(selectedLog) : null;

  const durationMs =
    selectedLog?.recording?.duration_ms ??
    selectedLog?.transcript?.duration_ms ??
    (selectedLog?.session?.ended_at
      ? new Date(selectedLog.session.ended_at).getTime() -
        new Date(selectedLog.session.started_at).getTime()
      : null);

  if (!contactId) {
    return (
      <div className="container py-8 mx-auto">
        <p className="text-muted-foreground">
          Missing contact id. Please open this page from a contact profile.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container py-8 mx-auto">
        <p className="text-muted-foreground">Loading call logs...</p>
      </div>
    );
  }

  if (isError || !callLogs) {
    return (
      <div className="container py-8 mx-auto">
        <p className="text-muted-foreground">
          Unable to load call logs. Please try again later.
        </p>
      </div>
    );
  }

  return (
    <div className="container py-8 mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-balance">{displayName}</h1>
          <p className="text-muted-foreground mt-2">
            Call history, recordings, and transcripts
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Call Sessions List — grouped by schedule */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">
              Sessions ({sessions.length})
            </CardTitle>
            <CardDescription>Click to view details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {scheduleGroups.map((group) => (
                <div key={group.scheduleId}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                    {group.scheduleName}
                  </p>
                  <div className="space-y-1">
                    {group.logs.map((log) => {
                      const session = log.session;
                      const rowDuration =
                        log.recording?.duration_ms ??
                        log.transcript?.duration_ms ??
                        (session.ended_at
                          ? new Date(session.ended_at).getTime() -
                            new Date(session.started_at).getTime()
                          : null);

                      return (
                        <button
                          key={session.id}
                          onClick={() => setSelectedSessionId(session.id)}
                          className={`w-full p-3 rounded-lg border text-left transition-colors ${
                            selectedSessionId === session.id
                              ? 'bg-primary/10 border-primary'
                              : 'hover:bg-muted border-transparent'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {formatDate(session.started_at)}
                              </p>
                              <div className="flex gap-1 flex-wrap mt-1">
                                <Badge variant="secondary" className="text-xs">
                                  {formatDurationMs(rowDuration)}
                                </Badge>
                                {log.transcript?.count ? (
                                  <Badge variant="secondary" className="text-xs">
                                    {log.transcript.count} transcript
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                            <Badge
                              className={`text-xs whitespace-nowrap ${getStatusColor(session.status)}`}
                            >
                              {session.status === 'completed' ? '✓' : '●'}
                            </Badge>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Call Details */}
        <Card className="lg:col-span-2">
          {selectedLog ? (
            <>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>Call Details</CardTitle>
                    <CardDescription>
                      {formatDate(selectedLog.session.started_at)}
                      {' · '}
                      {selectedLog.schedule.name}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {selectedLog.session.risk_level && (
                      <Badge className={getRiskLevelColor(selectedLog.session.risk_level)}>
                        {selectedLog.session.risk_level.charAt(0).toUpperCase() +
                          selectedLog.session.risk_level.slice(1)}{' '}
                        Risk
                      </Badge>
                    )}
                    <Badge className={getStatusColor(selectedLog.session.status)}>
                      {selectedLog.session.status.replace(/_/g, ' ').toUpperCase()}
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <Tabs defaultValue="recording" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="recording">Recording</TabsTrigger>
                    <TabsTrigger value="transcript">Transcript</TabsTrigger>
                    <TabsTrigger value="notes">Notes</TabsTrigger>
                  </TabsList>

                  {/* Recording Tab */}
                  <TabsContent value="recording" className="space-y-4 pt-2">
                    {twilioRecording ? (
                      <>
                        <CallRecordingCard
                          recording={twilioRecording}
                          createdAt={selectedLog.session.started_at}
                        />
                        <p className="text-sm text-muted-foreground">
                          Duration: {formatDurationMs(durationMs)}
                        </p>
                      </>
                    ) : (
                      <div className="py-8 text-center text-muted-foreground">
                        <p>No recording available for this session</p>
                      </div>
                    )}
                  </TabsContent>

                  {/* Transcript Tab */}
                  <TabsContent
                    value="transcript"
                    className="space-y-3 max-h-96 overflow-y-auto"
                  >
                    {selectedTranscripts.length > 0 ? (
                      selectedTranscripts.map((trans) => (
                        <div
                          key={trans.id}
                          className={`p-3 rounded-lg ${
                            trans.speaker === 'user'
                              ? 'bg-blue-500/10 border border-blue-200'
                              : 'bg-gray-100 border border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-muted-foreground" />
                              <span className="font-semibold text-sm">
                                {trans.speaker === 'user'
                                  ? 'Caller'
                                  : trans.speaker === 'assistant'
                                    ? 'Assistant'
                                    : 'System'}
                              </span>
                            </div>
                            {trans.confidence != null && (
                              <span className="text-xs text-muted-foreground">
                                Confidence: {(trans.confidence * 100).toFixed(0)}%
                              </span>
                            )}
                          </div>
                          <p className="text-sm leading-relaxed">{trans.transcript}</p>
                          <p className="text-xs text-muted-foreground mt-2">
                            <Clock className="w-3 h-3 inline mr-1" />
                            {formatTimestampMs(trans.start_ms)} -{' '}
                            {formatTimestampMs(trans.end_ms)}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="py-8 text-center text-muted-foreground">
                        <p>No transcript available</p>
                      </div>
                    )}
                  </TabsContent>

                  {/* Notes Tab */}
                  <TabsContent value="notes" className="space-y-4">
                    {selectedLog.session.ai_summary && (
                      <div>
                        <p className="text-sm font-semibold mb-2">AI Summary</p>
                        <p className="text-sm leading-relaxed bg-muted p-3 rounded-lg">
                          {selectedLog.session.ai_summary}
                        </p>
                      </div>
                    )}
                    {selectedLog.session.notes_for_human && (
                      <div>
                        <p className="text-sm font-semibold mb-2">Human Notes</p>
                        <p className="text-sm leading-relaxed bg-yellow-500/10 border border-yellow-200 p-3 rounded-lg">
                          {selectedLog.session.notes_for_human}
                        </p>
                      </div>
                    )}
                    {!selectedLog.session.ai_summary && !selectedLog.session.notes_for_human && (
                      <div className="py-8 text-center text-muted-foreground">
                        <p>No notes for this session</p>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </>
          ) : (
            <CardContent className="py-12 text-center text-muted-foreground">
              <p>Select a call session to view details</p>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
