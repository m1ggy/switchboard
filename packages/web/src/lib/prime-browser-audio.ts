export async function primeBrowserAudio(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Browser does not support getUserMedia');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  // Permission + hardware warm-up only
  stream.getTracks().forEach((track) => track.stop());

  // Refresh device list after permission is granted
  if (navigator.mediaDevices.enumerateDevices) {
    await navigator.mediaDevices.enumerateDevices();
  }
}
