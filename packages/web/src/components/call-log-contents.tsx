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

interface CallSession {
  id: string;
  started_at: string;
  ended_at?: string;
  status: string;
  risk_level?: string;
  ai_summary?: string;
  notes_for_human?: string;
}

interface Recording {
  id: string;
  session_id: string;
  combined_url?: string;
  inbound_url?: string;
  outbound_url?: string;
  duration_ms?: number;
}

interface Transcript {
  id: string;
  session_id: string;
  speaker: string;
  channel: string;
  transcript: string;
  start_ms: number;
  end_ms: number;
  confidence?: number;
}

// ---------- Mock Data ----------
const mockCallSessions = (scheduleId: string): CallSession[] => [
  {
    id: `session_${scheduleId}_1`,
    started_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    ended_at: new Date(
      Date.now() - 2 * 24 * 60 * 60 * 1000 + 15 * 60 * 1000
    ).toISOString(),
    status: 'completed',
    risk_level: 'low',
    ai_summary:
      'Positive conversation. Caller reported good health and mood. Discussed upcoming family visit.',
    notes_for_human: 'Patient seemed cheerful today. No concerns noted.',
  },
  {
    id: `session_${scheduleId}_2`,
    started_at: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
    ended_at: new Date(
      Date.now() - 9 * 24 * 60 * 60 * 1000 + 18 * 60 * 1000
    ).toISOString(),
    status: 'completed',
    risk_level: 'low',
    ai_summary:
      'Regular check-in. Caller discussed new hobbies and social activities.',
    notes_for_human: 'Engaged and positive. Continue weekly schedule.',
  },
  {
    id: `session_${scheduleId}_3`,
    started_at: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString(),
    ended_at: new Date(
      Date.now() - 16 * 24 * 60 * 60 * 1000 + 22 * 60 * 1000
    ).toISOString(),
    status: 'completed',
    risk_level: 'medium',
    ai_summary:
      'Caller mentioned feeling slightly isolated this week. Discussed plans to join community center activities.',
    notes_for_human:
      'Minor mood dip. Recommended social engagement. Follow up next week.',
  },
];

const mockRecordings = (sessionId: string): Recording => ({
  id: `recording_${sessionId}`,
  session_id: sessionId,
  combined_url:
    '/placeholder.mp3?height=50&width=300&query=call+recording+audio',
  duration_ms: 15 * 60 * 1000,
});

const mockTranscripts = (sessionId: string): Transcript[] => [
  {
    id: `trans_${sessionId}_1`,
    session_id: sessionId,
    speaker: 'bot',
    channel: 'outbound',
    transcript:
      'Hello, this is your weekly reassurance call. How are you doing today?',
    start_ms: 0,
    end_ms: 3500,
    confidence: 0.98,
  },
  {
    id: `trans_${sessionId}_2`,
    session_id: sessionId,
    speaker: 'user',
    channel: 'inbound',
    transcript:
      "Hi! I'm doing quite well, thanks for calling. Just finished having lunch with a friend.",
    start_ms: 3500,
    end_ms: 9000,
    confidence: 0.95,
  },
  {
    id: `trans_${sessionId}_3`,
    session_id: sessionId,
    speaker: 'bot',
    channel: 'outbound',
    transcript:
      "That's wonderful! Tell me more about your friend. How long have you known them?",
    start_ms: 9000,
    end_ms: 12500,
    confidence: 0.97,
  },
];

// ---------- Helpers ----------
const useQuery = () => {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
};

export default function CallLogsContent() {
  const navigate = useNavigate();
  const query = useQuery();

  const scheduleId = query.get('schedule') || 'default';
  const scheduleName = query.get('name') || 'Call Logs';

  const [callSessions, setCallSessions] = useState<CallSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<CallSession | null>(
    null
  );
  const [recordings, setRecordings] = useState<Map<string, Recording>>(
    new Map()
  );
  const [transcripts, setTranscripts] = useState<Map<string, Transcript[]>>(
    new Map()
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const sessions = mockCallSessions(scheduleId);
    setCallSessions(sessions);

    const recordingsMap = new Map<string, Recording>();
    const transcriptsMap = new Map<string, Transcript[]>();

    sessions.forEach((session) => {
      recordingsMap.set(session.id, mockRecordings(session.id));
      transcriptsMap.set(session.id, mockTranscripts(session.id));
    });

    setRecordings(recordingsMap);
    setTranscripts(transcriptsMap);
    setSelectedSession(sessions[0]);

    setIsLoading(false);
  }, [scheduleId]);

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

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
  };

  const getRiskLevelColor = (level?: string) => {
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
      case 'failed':
        return 'bg-red-500/10 text-red-700';
      default:
        return 'bg-gray-500/10 text-gray-700';
    }
  };

  if (isLoading) {
    return (
      <div className="container py-8 mx-auto">
        <p className="text-muted-foreground">Loading call logs...</p>
      </div>
    );
  }

  const selectedRecording = selectedSession
    ? recordings.get(selectedSession.id)
    : null;

  const selectedTranscripts = selectedSession
    ? transcripts.get(selectedSession.id) || []
    : [];

  return (
    <div className="container py-8 mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-balance">{scheduleName}</h1>
          <p className="text-muted-foreground mt-2">
            Call history and recordings
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Call Sessions List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">
              Sessions ({callSessions.length})
            </CardTitle>
            <CardDescription>Click to view details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {callSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setSelectedSession(session)}
                  className={`w-full p-3 rounded-lg border text-left transition-colors ${
                    selectedSession?.id === session.id
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
                          {formatDuration(
                            recordings.get(session.id)?.duration_ms ||
                              (session.ended_at
                                ? new Date(session.ended_at).getTime() -
                                  new Date(session.started_at).getTime()
                                : 0)
                          )}
                        </Badge>
                      </div>
                    </div>
                    <Badge
                      className={`text-xs whitespace-nowrap ${getStatusColor(session.status)}`}
                    >
                      {session.status === 'completed' ? '✓' : '●'}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Call Details */}
        <Card className="lg:col-span-2">
          {selectedSession ? (
            <>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>Call Details</CardTitle>
                    <CardDescription>
                      {formatDate(selectedSession.started_at)}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {selectedSession.risk_level && (
                      <Badge
                        className={`${getRiskLevelColor(selectedSession.risk_level)}`}
                      >
                        {selectedSession.risk_level.charAt(0).toUpperCase() +
                          selectedSession.risk_level.slice(1)}{' '}
                        Risk
                      </Badge>
                    )}
                    <Badge className={getStatusColor(selectedSession.status)}>
                      {selectedSession.status.replace(/_/g, ' ').toUpperCase()}
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
                    {selectedRecording ? (
                      <div className="space-y-4">
                        <div className="bg-muted p-4 rounded-lg">
                          <p className="text-sm font-semibold mb-3">
                            Call Recording
                          </p>
                          <audio
                            controls
                            className="w-full"
                            src={selectedRecording.combined_url}
                            crossOrigin="anonymous"
                          />
                        </div>

                        {selectedRecording.combined_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                            className="gap-2 bg-transparent"
                          >
                            <a href={selectedRecording.combined_url} download>
                              <Download className="w-4 h-4" />
                              Download Recording
                            </a>
                          </Button>
                        )}

                        <div className="pt-2 border-t">
                          <p className="text-sm text-muted-foreground">
                            Duration:{' '}
                            {formatDuration(selectedRecording.duration_ms)}
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
                                  : 'Assistant'}
                              </span>
                            </div>
                            {trans.confidence && (
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
                            {formatDuration(trans.start_ms)} -{' '}
                            {formatDuration(trans.end_ms)}
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
                    {selectedSession.ai_summary && (
                      <div>
                        <p className="text-sm font-semibold mb-2">AI Summary</p>
                        <p className="text-sm leading-relaxed bg-muted p-3 rounded-lg">
                          {selectedSession.ai_summary}
                        </p>
                      </div>
                    )}
                    {selectedSession.notes_for_human && (
                      <div>
                        <p className="text-sm font-semibold mb-2">
                          Human Notes
                        </p>
                        <p className="text-sm leading-relaxed bg-yellow-500/10 border border-yellow-200 p-3 rounded-lg">
                          {selectedSession.notes_for_human}
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
