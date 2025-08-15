import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Home } from 'lucide-react';
import { Link } from 'react-router';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] grid place-items-center p-6">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Page not found</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            The page you’re looking for doesn’t exist or has been moved.
          </p>
        </CardHeader>
        <CardContent className="flex justify-center gap-2">
          <Button asChild variant="secondary">
            <Link to={-1 as any}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go back
            </Link>
          </Button>
          <Button asChild>
            <Link to="/dashboard">
              <Home className="mr-2 h-4 w-4" />
              Dashboard
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
