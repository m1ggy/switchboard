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
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {weeklyCallCountLoading ? (
          <Skeleton />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Week's Call Count</CardTitle>
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
              <CardTitle>Week's Call Duration</CardTitle>
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
              {topContactByCallCount?.[0].label} (
              {topContactByCallCount?.[0].call_count})
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
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="calls"
                  stroke="#3b82f6"
                  name="Calls"
                />
                <Line
                  type="monotone"
                  dataKey="sms"
                  stroke="#10b981"
                  name="SMS"
                />
              </LineChart>
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
