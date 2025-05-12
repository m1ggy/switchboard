import { Ellipsis } from 'lucide-react';

function PageLoader() {
  return (
    <div className="flex min-h-screen min-w-screen justify-center items-center gap-2">
      <div className="text-muted-foreground font-semibold flex gap-2">
        Loading
        <Ellipsis className=" animate-pulse" />
      </div>
    </div>
  );
}

export default PageLoader;
