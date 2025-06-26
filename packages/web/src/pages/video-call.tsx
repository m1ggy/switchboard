import { useSearchParams } from 'react-router';

function VideoCall() {
  const params = useSearchParams();

  console.log({ params });
  return <div>VideoCall</div>;
}

export default VideoCall;
