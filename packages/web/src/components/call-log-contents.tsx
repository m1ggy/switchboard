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
import { ArrowLeft, Clock, Download, Play, User } from 'lucide-react';

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

// For durations (e.g. 125000ms => "2m 5s")
const formatDurationMs = (ms?: number | null) => {
  if (!ms || ms <= 0) return 'N/A';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
};

// For timestamps (offsets) (e.g. 65432ms => "01:05")
const formatTimestampMs = (ms?: number | null) => {
  if (ms == null || ms < 0) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
    2,
    '0'
  )}`;
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

function buildRecordingCandidates(rec: Recording | null): string[] {
  if (!rec) return [];
  // FE preference: combined > inbound > outbound
  const urls = [rec.combined_url, rec.inbound_url, rec.outbound_url].filter(
    Boolean
  ) as string[];

  // Deduplicate while preserving order
  return Array.from(new Set(urls));
}

export default function CallLogsContent() {
  const navigate = useNavigate();
  const query = useQueryParams();
  const trpc = useTRPC();

  // ✅ expect `contact` instead of `schedule`
  const contactId = query.get('contact') || '';
  const displayName = query.get('name') || 'Call Logs';

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  );

  // audio src fallback
  const [audioIndex, setAudioIndex] = useState(0);

  // ✅ Fetch call logs for this contact
  const {
    data: callLogs,
    isLoading,
    isError,
  } = useQuery({
    ...trpc.reassuranceContactProfiles.getCallLogsByContactId.queryOptions({
      contactId,
      limit: 50,
      includeTranscript: true,
      transcriptLimit: 500,
    }),
    enabled: !!contactId,
  });

  // Select first session on load
  useEffect(() => {
    if (callLogs?.length && !selectedSessionId) {
      setSelectedSessionId((callLogs as any[])[0].session.id);
    }
  }, [callLogs, selectedSessionId]);

  // Reset audio fallback index when switching sessions
  useEffect(() => {
    setAudioIndex(0);
  }, [selectedSessionId]);

  const selectedLog: CallLog | null = useMemo(() => {
    if (!callLogs || !selectedSessionId) return null;
    return (callLogs as any[]).find(
      (l) => l.session.id === selectedSessionId
    ) as CallLog | null;
  }, [callLogs, selectedSessionId]);

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

  const sessions = callLogs as CallLog[];

  const selectedRecording = selectedLog?.recording ?? null;
  const selectedTranscripts = selectedLog?.transcript?.items ?? [];

  const recordingCandidates = buildRecordingCandidates(selectedRecording);
  const activeRecordingUrl =
    recordingCandidates[audioIndex] ?? recordingCandidates[0] ?? null;

  // duration: prefer recording duration_ms, otherwise transcript duration, otherwise session diff
  const durationMs =
    selectedRecording?.duration_ms ??
    selectedLog?.transcript?.duration_ms ??
    (selectedLog?.session?.ended_at
      ? new Date(selectedLog.session.ended_at).getTime() -
        new Date(selectedLog.session.started_at).getTime()
      : null);

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
        {/* Call Sessions List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">
              Sessions ({sessions.length})
            </CardTitle>
            <CardDescription>Click to view details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sessions.map((log) => {
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
                        className={`text-xs whitespace-nowrap ${getStatusColor(
                          session.status
                        )}`}
                      >
                        {session.status === 'completed' ? '✓' : '●'}
                      </Badge>
                    </div>
                  </button>
                );
              })}
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
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {selectedLog.session.risk_level && (
                      <Badge
                        className={getRiskLevelColor(
                          selectedLog.session.risk_level
                        )}
                      >
                        {selectedLog.session.risk_level
                          .charAt(0)
                          .toUpperCase() +
                          selectedLog.session.risk_level.slice(1)}{' '}
                        Risk
                      </Badge>
                    )}
                    <Badge
                      className={getStatusColor(selectedLog.session.status)}
                    >
                      {selectedLog.session.status
                        .replace(/_/g, ' ')
                        .toUpperCase()}
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
                  <TabsContent value="recording" className="space-y-4">
                    {activeRecordingUrl ? (
                      <div className="space-y-4">
                        <div className="bg-muted p-4 rounded-lg">
                          <p className="text-sm font-semibold mb-3">
                            Call Recording
                          </p>

                          <audio
                            key={activeRecordingUrl} // forces reload when we swap to a fallback URL
                            controls
                            className="w-full"
                            src={activeRecordingUrl}
                            crossOrigin="anonymous"
                            onError={() => {
                              // Auto-fallback to next candidate if current fails
                              if (audioIndex < recordingCandidates.length - 1) {
                                setAudioIndex((i) => i + 1);
                              }
                            }}
                          />

                          {recordingCandidates.length > 1 && (
                            <p className="text-xs text-muted-foreground mt-2">
                              Source{' '}
                              {Math.min(
                                audioIndex + 1,
                                recordingCandidates.length
                              )}{' '}
                              of {recordingCandidates.length}
                            </p>
                          )}
                        </div>

                        <div className="flex gap-2 flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                            className="gap-2 bg-transparent"
                          >
                            <a href={activeRecordingUrl} download>
                              <Download className="w-4 h-4" />
                              Download Recording
                            </a>
                          </Button>

                          {/* Optional: allow user to manually switch sources */}
                          {recordingCandidates.length > 1 && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="bg-transparent"
                              onClick={() =>
                                setAudioIndex((i) =>
                                  i < recordingCandidates.length - 1 ? i + 1 : 0
                                )
                              }
                            >
                              Try other source
                            </Button>
                          )}
                        </div>

                        <div className="pt-2 border-t">
                          <p className="text-sm text-muted-foreground">
                            Duration: {formatDurationMs(durationMs)}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="py-8 text-center text-muted-foreground">
                        <Play className="w-8 h-8 mx-auto mb-2 opacity-50" />
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
                                Confidence:{' '}
                                {(trans.confidence * 100).toFixed(0)}%
                              </span>
                            )}
                          </div>

                          <p className="text-sm leading-relaxed">
                            {trans.transcript}
                          </p>

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
                        <p className="text-sm font-semibold mb-2">
                          Human Notes
                        </p>
                        <p className="text-sm leading-relaxed bg-yellow-500/10 border border-yellow-200 p-3 rounded-lg">
                          {selectedLog.session.notes_for_human}
                        </p>
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
