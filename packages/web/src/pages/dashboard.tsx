import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import TooltipStandalone from '@/components/ui/tooltip-standalone';
import { useTRPC } from '@/lib/trpc';
import { formatDurationWithDateFns } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';

function CustomChartTooltip({
  active,
  payload,
  label,
}: TooltipProps<string, string>) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-md border bg-background p-3 shadow-md text-sm">
      <div className="mb-1 font-medium text-muted-foreground">{label}</div>
      <div className="space-y-1">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name}
            </span>
            <span className="font-medium text-foreground">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Dashboard() {
  const trpc = useTRPC();

  const { data: userInfo } = useQuery(trpc.users.getUser.queryOptions());

  const { data: usage, isLoading: usageLoading } = useQuery(
    trpc.subscription.getUsageStatistics.queryOptions()
  );

  const { data: usageLimits } = useQuery(
    trpc.subscription.getPlanUsageLimits.queryOptions()
  );

  const maxVoiceMinutes = usageLimits?.find(
    (p) => p.metric_key === 'minutes_combined'
  );
  const voiceCallsUsage = usage?.['call'] ?? 0;
  const maxSMS = usageLimits?.find((p) => p.metric_key === 'sms_usage');
  const smsUsage = usage?.['sms'] ?? 0;
  const maxFax = usageLimits?.find((p) => p.metric_key === 'fax_usage');
  const faxUsage = usage?.['fax'] ?? 0;

  const { data: weeklyCallCount, isLoading: weeklyCallCountLoading } = useQuery(
    trpc.statistics.getWeeklyCount.queryOptions()
  );

  const { data: weeklyCallDuration, isLoading: weeklyCallDurationLoading } =
    useQuery(trpc.statistics.getWeeklyCallDuration.queryOptions());

  const { data: longestCallThisWeek, isLoading: longestCallThisWeekLoading } =
    useQuery(trpc.statistics.getLongestCallThisWeek.queryOptions());

  const {
    data: avgCallDurationThisWeek,
    isLoading: avgCallDurationThisWeekLoading,
  } = useQuery(trpc.statistics.getAvgCallDurationThisWeek.queryOptions());

  const {
    data: topContactByCallCount,
    isLoading: topContactByCallCountLoading,
  } = useQuery(trpc.statistics.getTopContactsByCallCount.queryOptions());

  const { data: chartData, isLoading: chartLoading } = useQuery(
    trpc.statistics.getWeeklyChartData.queryOptions()
  );

  const { data: companies, isLoading: companiesLoading } = useQuery(
    trpc.statistics.getCompanyTableSummary.queryOptions()
  );

  // Helpers
  const nf = useMemo(() => new Intl.NumberFormat(), []);
  const pct = (num: number, den: number | undefined | null) => {
    if (!den || den <= 0) return 0;
    return Math.min(100, Math.max(0, (num / den) * 100));
  };
  const safeDur = (n?: number) =>
    typeof n === 'number' ? formatDurationWithDateFns(n) : '—';

  return (
    <div
      className="min-h-dvh p-4 sm:p-6 space-y-5 sm:space-y-6
                 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] my-8"
    >
      <header>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
          Dashboard
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Call and SMS overview across all companies
        </p>
      </header>

      {/* Stat Cards */}
      <section className="space-y-3">
        <h2 className="text-sm sm:text-base font-bold">This Week</h2>
        <div className="grid gap-3 sm:gap-4 grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {weeklyCallCountLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm text-muted-foreground">
                  Call count
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {nf.format(weeklyCallCount ?? 0)}
              </CardContent>
            </Card>
          )}

          {weeklyCallDurationLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm text-muted-foreground">
                  Call duration
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {safeDur(weeklyCallDuration as number)}
              </CardContent>
            </Card>
          )}

          {avgCallDurationThisWeekLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm text-muted-foreground">
                  Average call duration
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {safeDur(avgCallDurationThisWeek as number)}
              </CardContent>
            </Card>
          )}

          {longestCallThisWeekLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm text-muted-foreground">
                  Longest call
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {safeDur(longestCallThisWeek as number)}
              </CardContent>
            </Card>
          )}

          {topContactByCallCountLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            topContactByCallCount &&
            topContactByCallCount?.[0]?.call_count > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm text-muted-foreground">
                    Contact with most calls
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-lg sm:text-2xl font-bold truncate">
                  <span className="truncate">
                    {topContactByCallCount?.[0]?.label}
                  </span>{' '}
                  <span className="text-muted-foreground">
                    ({nf.format(topContactByCallCount?.[0]?.call_count ?? 0)})
                  </span>
                </CardContent>
              </Card>
            )
          )}
        </div>
      </section>

      {/* Chart Section */}
      <section>
        {chartLoading ? (
          <Skeleton className="h-64 sm:h-72 w-full" />
        ) : (
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-base sm:text-lg">
                Weekly Call & SMS Trends
              </CardTitle>
            </CardHeader>
            <CardContent className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData ?? []}
                  margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="callsGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                      <stop
                        offset="95%"
                        stopColor="#3b82f6"
                        stopOpacity={0.1}
                      />
                    </linearGradient>
                    <linearGradient
                      id="smsGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                      <stop
                        offset="95%"
                        stopColor="#10b981"
                        stopOpacity={0.1}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip content={<CustomChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="calls"
                    stroke="#3b82f6"
                    fill="url(#callsGradient)"
                    name="Calls"
                  />
                  <Area
                    type="monotone"
                    dataKey="sms"
                    stroke="#10b981"
                    fill="url(#smsGradient)"
                    name="SMS"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Companies Table */}
      <section>
        {companiesLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : (
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-base sm:text-lg">Companies</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Mobile: horizontal scroll */}
              <div className="-mx-4 sm:mx-0 overflow-x-auto">
                <div className="min-w-[640px] sm:min-w-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company</TableHead>
                        <TableHead>Number</TableHead>
                        <TableHead>Calls Today</TableHead>
                        <TableHead>SMS</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {companies?.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="max-w-[12rem] truncate">
                            {c.name}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {c.phone}
                          </TableCell>
                          <TableCell>{nf.format(c.calls)}</TableCell>
                          <TableCell>{nf.format(c.sms)}</TableCell>
                          <TableCell>
                            <Badge
                              variant={c.active ? 'default' : 'destructive'}
                            >
                              {c.active ? 'Active' : 'Paused'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Usage */}
      <section>
        {usageLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-base sm:text-lg">Usage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 sm:space-y-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">SMS</span>
                  <TooltipStandalone
                    content={`${maxSMS?.unit} (inbound + outbound)`}
                  >
                    <Info className="h-4 w-4" />
                  </TooltipStandalone>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <Progress value={pct(smsUsage, maxSMS?.included_quantity)} />
                  <Badge className="w-fit">
                    {nf.format(smsUsage)} /{' '}
                    {nf.format(maxSMS?.included_quantity ?? 0)}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">Voice Calls</span>
                  <TooltipStandalone
                    content={`${maxVoiceMinutes?.unit} (inbound + outbound)`}
                  >
                    <Info className="h-4 w-4" />
                  </TooltipStandalone>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <Progress
                    value={pct(
                      voiceCallsUsage,
                      maxVoiceMinutes?.included_quantity
                    )}
                  />
                  <Badge className="w-fit">
                    {nf.format(
                      Number.isFinite(voiceCallsUsage) ? voiceCallsUsage : 0
                    )}{' '}
                    / {nf.format(maxVoiceMinutes?.included_quantity ?? 0)}
                  </Badge>
                </div>
              </div>

              {typeof maxFax !== 'undefined' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Fax</span>
                    <TooltipStandalone
                      content={`${maxFax?.unit} (inbound + outbound)`}
                    >
                      <Info className="h-4 w-4" />
                    </TooltipStandalone>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <Progress
                      value={pct(faxUsage, maxFax?.included_quantity)}
                    />
                    <Badge className="w-fit">
                      {nf.format(faxUsage)} /{' '}
                      {nf.format(maxFax?.included_quantity ?? 0)}
                    </Badge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

export default Dashboard;
