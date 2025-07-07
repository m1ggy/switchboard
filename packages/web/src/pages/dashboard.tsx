import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTRPC } from '@/lib/trpc';
import { formatDurationWithDateFns } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';

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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Call and SMS overview across all companies
        </p>
      </div>

      {/* Stat Cards */}
      <h2 className="font-bold">This Week</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {weeklyCallCountLoading ? (
          <Skeleton />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Call count</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {weeklyCallCount}
            </CardContent>
          </Card>
        )}
        {weeklyCallDurationLoading ? (
          <Skeleton />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Call duration</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {formatDurationWithDateFns(weeklyCallDuration as number)}
            </CardContent>
          </Card>
        )}
        {avgCallDurationThisWeekLoading ? (
          <Skeleton />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Average call duration this week</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {formatDurationWithDateFns(avgCallDurationThisWeek as number)}
            </CardContent>
          </Card>
        )}
        {longestCallThisWeekLoading ? (
          <Skeleton />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Longest call this week</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {formatDurationWithDateFns(longestCallThisWeek as number)}
            </CardContent>
          </Card>
        )}
        {topContactByCallCountLoading ? (
          <Skeleton />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Contact with most calls</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {topContactByCallCount?.[0]?.label} (
              {topContactByCallCount?.[0]?.call_count})
            </CardContent>
          </Card>
        )}
      </div>

      {/* Chart Section */}
      {chartLoading ? (
        <Skeleton className="h-[300px]" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Weekly Call & SMS Trends</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData ?? []}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
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
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="smsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
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

      {companiesLoading ? (
        <Skeleton className="h-[200px]" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Companies</CardTitle>
          </CardHeader>
          <CardContent>
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
                    <TableCell>{c.name}</TableCell>
                    <TableCell>{c.phone}</TableCell>
                    <TableCell>{c.calls}</TableCell>
                    <TableCell>{c.sms}</TableCell>
                    <TableCell>
                      <Badge variant={c.active ? 'default' : 'destructive'}>
                        {c.active ? 'Active' : 'Paused'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default Dashboard;
