import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
  const companies = [
    {
      id: 1,
      name: 'Acme Co.',
      phone: '(555) 123-0001',
      calls: 12,
      sms: 28,
      active: true,
    },
    {
      id: 2,
      name: 'Bravo Inc.',
      phone: '(555) 888-9988',
      calls: 3,
      sms: 6,
      active: false,
    },
  ];

  const usage = {
    minutes: 812,
    minutesLimit: 1000,
    sms: 1220,
    smsLimit: 1500,
  };

  const alerts = [
    {
      id: 1,
      title: 'Slack Integration Error',
      message: 'Slack webhook for \u201cAcme Co.\u201d failed to deliver.',
    },
  ];

  const chartData = [
    { date: 'Mon', calls: 30, sms: 100 },
    { date: 'Tue', calls: 25, sms: 80 },
    { date: 'Wed', calls: 40, sms: 90 },
    { date: 'Thu', calls: 35, sms: 110 },
    { date: 'Fri', calls: 20, sms: 70 },
    { date: 'Sat', calls: 10, sms: 40 },
    { date: 'Sun', calls: 15, sms: 50 },
  ];

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
        <Card>
          <CardHeader>
            <CardTitle>Today's Calls</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">36</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>SMS Sent</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">122</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Active Companies</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">2</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Minutes Used</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">812</CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {alerts.map((alert) => (
        <Alert key={alert.id} variant="destructive">
          <AlertTitle>{alert.title}</AlertTitle>
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      ))}

      {/* Usage Tracking */}
      <Card>
        <CardHeader>
          <CardTitle>Usage This Month</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>Voice Minutes</span>
              <span>
                {usage.minutes} / {usage.minutesLimit}
              </span>
            </div>
            <Progress value={(usage.minutes / usage.minutesLimit) * 100} />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>SMS Sent</span>
              <span>
                {usage.sms} / {usage.smsLimit}
              </span>
            </div>
            <Progress value={(usage.sms / usage.smsLimit) * 100} />
          </div>
        </CardContent>
      </Card>

      {/* Chart Section */}
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
              <Line type="monotone" dataKey="sms" stroke="#10b981" name="SMS" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Company Table */}
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
              {companies.map((c) => (
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
    </div>
  );
}

export default Dashboard;
