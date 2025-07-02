import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { Loader } from 'lucide-react';
import { useParams } from 'react-router';

function ShortUrl() {
  const trpc = useTRPC();

  const { shortUrlId } = useParams();

  const {
    data: url,
    error,
    isFetched,
  } = useQuery({
    ...trpc.shortenUrl.getFullUrl.queryOptions({
      shortUrlId: shortUrlId as string,
    }),
    enabled: !!shortUrlId,
    refetchOnWindowFocus: false,
  });

  const ErrorMessage = () => (
    <div className="flex justify-center items-center w-[100vw] h-[100vh]">
      <span className="text-muted-foreground flex gap-2 text-sm font-semibold items-center">
        This link is broken or is already expired.
      </span>
    </div>
  );

  if (error && isFetched) {
    return <ErrorMessage />;
  }

  if (url && isFetched) {
    window.location.href = url.url;
  } else if (!url && isFetched) {
    return <ErrorMessage />;
  }

  console.log({ url });
  return (
    <div className="flex justify-center items-center w-[100vw] h-[100vh]">
      <span className="text-muted-foreground flex gap-2 text-sm font-semibold items-center">
        <Loader className="animate-spin" /> Redirecting you, please wait...
      </span>
    </div>
  );
}

export default ShortUrl;
