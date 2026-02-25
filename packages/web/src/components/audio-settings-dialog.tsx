import { useTwilioVoice } from '@/hooks/twilio-provider';
import { AudioLines } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from './ui/select';

type DeviceOption = { id: string; label: string };

function MicWaveform({
  deviceId,
  enabled,
  height = 48,
}: {
  deviceId: string;
  enabled: boolean;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Uint8Array | null>(null);

  const [rms, setRms] = useState(0);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (audioCtxRef.current) {
      // close can throw if already closed
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    analyserRef.current = null;
    dataRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!enabled || !deviceId) return;

    // Always stop previous pipeline first
    stop();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;

      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyserRef.current = analyser;

      // Good defaults for “voice” metering
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;

      source.connect(analyser);

      const buffer = new Uint8Array(analyser.fftSize);
      dataRef.current = buffer;

      const draw = () => {
        const canvas = canvasRef.current;
        const a = analyserRef.current;
        const data = dataRef.current;
        if (!canvas || !a || !data) return;

        const ctx2d = canvas.getContext('2d');
        if (!ctx2d) return;

        a.getByteTimeDomainData(data);

        const { width, height } = canvas;

        // background
        ctx2d.clearRect(0, 0, width, height);

        // waveform
        ctx2d.lineWidth = 2;
        ctx2d.beginPath();

        let sumSq = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128; // [-1..1]
          sumSq += v * v;

          const x = (i / (data.length - 1)) * width;
          const y = (0.5 + v * 0.45) * height;

          if (i === 0) ctx2d.moveTo(x, y);
          else ctx2d.lineTo(x, y);
        }

        ctx2d.stroke();

        // RMS (0..1) for a simple “level” indicator
        const nextRms = Math.min(1, Math.sqrt(sumSq / data.length) * 2.2);
        setRms(nextRms);

        rafRef.current = requestAnimationFrame(draw);
      };

      rafRef.current = requestAnimationFrame(draw);
    } catch (err) {
      console.error('MicWaveform getUserMedia error:', err);
      stop();
    }
  }, [deviceId, enabled, stop]);

  useEffect(() => {
    start();
    return () => stop();
  }, [start, stop]);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium">Mic level</div>

      <div className="rounded-md border p-2">
        <canvas
          ref={canvasRef}
          height={height}
          // Use CSS width; canvas will scale its drawing buffer via JS below
          className="h-12 w-full"
        />
        <div className="mt-2 h-2 w-full rounded bg-muted">
          <div
            className="h-2 rounded bg-foreground transition-[width]"
            style={{ width: `${Math.round(rms * 100)}%` }}
          />
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          {Math.round(rms * 100)}%
        </div>
      </div>

      {/* Resize canvas drawing buffer to match CSS width for crisp lines */}
      <ResizeCanvasToParent canvasRef={canvasRef} />
    </div>
  );
}

function ResizeCanvasToParent({
  canvasRef,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;

      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      // Match the canvas internal buffer to the rendered size
      const targetWidth = Math.max(1, Math.floor(rect.width * dpr));
      const targetHeight = Math.max(1, Math.floor(canvas.height * dpr)); // keep requested height

      if (canvas.width !== targetWidth) canvas.width = targetWidth;
      if (canvas.height !== targetHeight) canvas.height = targetHeight;
    };

    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      ro.disconnect();
    };
  }, [canvasRef]);

  return null;
}

function AudioSettingsHoverCard() {
  const { clientRef, ready } = useTwilioVoice();
  const audio = clientRef.current?.device?.audio;

  const [inputOptions, setInputOptions] = useState<DeviceOption[]>([]);
  const [outputOptions, setOutputOptions] = useState<DeviceOption[]>([]);

  const [activeInputId, setActiveInputId] = useState<string>('');
  const [activeOutputId, setActiveOutputId] = useState<string>('');

  const outputSupported = useMemo(
    () => Boolean(audio?.isOutputSelectionSupported),
    [audio]
  );

  const ensureMicPermission = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error('Microphone permission denied or error:', err);
    }
  }, []);

  const readTwilioAudioState = useCallback(() => {
    if (!audio) return;

    const inputs: DeviceOption[] = [];
    audio.availableInputDevices?.forEach((device, id) => {
      inputs.push({ id, label: device.label || 'Unknown Microphone' });
    });

    const outputs: DeviceOption[] = [];
    audio.availableOutputDevices?.forEach((device, id) => {
      outputs.push({ id, label: device.label || 'Unknown Speaker' });
    });

    setInputOptions(inputs);
    setOutputOptions(outputs);

    const currentInput = audio.inputDevice;
    if (currentInput?.deviceId) setActiveInputId(currentInput.deviceId);

    const currentSpeakers = audio.speakerDevices?.get?.();
    if (currentSpeakers && currentSpeakers.size) {
      const speakersArr = Array.from(currentSpeakers);
      const preferred =
        speakersArr.find((d) => d.deviceId && d.deviceId !== 'default') ??
        speakersArr[0];

      if (preferred?.deviceId) setActiveOutputId(preferred.deviceId);
    }
  }, [audio]);

  const bootstrapAndSync = useCallback(async () => {
    const audio = clientRef.current?.device?.audio;
    if (!audio) return;

    // 1) Make sure labels exist
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error('Microphone permission denied or error:', err);
      // still continue; device ids may exist even if labels don’t
    }

    // 2) Build options from Twilio first
    const inputsFromTwilio: DeviceOption[] = [];
    audio.availableInputDevices?.forEach((device, id) => {
      inputsFromTwilio.push({
        id,
        label: device.label || 'Unknown Microphone',
      });
    });

    const outputsFromTwilio: DeviceOption[] = [];
    audio.availableOutputDevices?.forEach((device, id) => {
      outputsFromTwilio.push({ id, label: device.label || 'Unknown Speaker' });
    });

    // 3) If Twilio list is empty, fall back to browser enumerateDevices
    let inputs = inputsFromTwilio;
    let outputs = outputsFromTwilio;

    if (!inputs.length || !outputs.length) {
      try {
        const mediaDevices = await navigator.mediaDevices.enumerateDevices();

        if (!inputs.length) {
          inputs = mediaDevices
            .filter((d) => d.kind === 'audioinput')
            .map((d) => ({
              id: d.deviceId,
              label: d.label || 'Unknown Microphone',
            }));
        }

        if (!outputs.length) {
          outputs = mediaDevices
            .filter((d) => d.kind === 'audiooutput')
            .map((d) => ({
              id: d.deviceId,
              label: d.label || 'Unknown Speaker',
            }));
        }
      } catch (err) {
        console.error('enumerateDevices error:', err);
      }
    }

    setInputOptions(inputs);
    setOutputOptions(outputs);

    // 4) Bootstrap Twilio input device if it’s not set yet
    const twilioInputId = audio.inputDevice?.deviceId;

    if (!twilioInputId) {
      // prefer "default" if it exists in our list; else first device
      const preferred =
        inputs.find((d) => d.id === 'default')?.id ?? inputs[0]?.id ?? '';

      if (preferred) {
        try {
          await audio.setInputDevice(preferred);
        } catch (err) {
          console.error('Failed to bootstrap Twilio input device:', err);
        }
      }
    }

    // 5) Now sync selected ids from Twilio (source of truth)
    const currentInput = audio.inputDevice?.deviceId;
    if (currentInput) setActiveInputId(currentInput);

    const currentSpeakers = audio.speakerDevices?.get?.();
    if (currentSpeakers && currentSpeakers.size) {
      const arr = Array.from(currentSpeakers);
      const first = arr.find((d) => d.deviceId)?.deviceId;
      if (first) setActiveOutputId(first);
    }
  }, [clientRef]);

  useEffect(() => {
    if (!ready) return;
    bootstrapAndSync();
  }, [ready, bootstrapAndSync]);

  useEffect(() => {
    const audio = clientRef.current?.device?.audio;
    if (!audio) return;

    const handler = () => bootstrapAndSync();
    audio.on?.('deviceChange', handler);

    return () => audio.off?.('deviceChange', handler);
  }, [clientRef, bootstrapAndSync]);

  useEffect(() => {
    const handler = () => bootstrapAndSync();
    navigator.mediaDevices?.addEventListener?.('devicechange', handler);
    return () =>
      navigator.mediaDevices?.removeEventListener?.('devicechange', handler);
  }, [bootstrapAndSync]);

  useEffect(() => {
    const handler = () => readTwilioAudioState();
    navigator.mediaDevices?.addEventListener?.('devicechange', handler);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handler);
    };
  }, [readTwilioAudioState]);

  const setInputDevice = useCallback(
    async (deviceId: string) => {
      if (!audio) return;
      try {
        await audio.setInputDevice(deviceId);
        readTwilioAudioState();
      } catch (err) {
        console.error('Failed to set input device:', err);
      }
    },
    [audio, readTwilioAudioState]
  );

  const setOutputDevice = useCallback(
    async (deviceId: string) => {
      if (!audio) return;
      if (!audio.isOutputSelectionSupported) return;

      try {
        await audio.speakerDevices.set([deviceId]);
        // Optional: keep ringtone on the same output device
        // await audio.ringtoneDevices.set([deviceId]);
        readTwilioAudioState();
      } catch (err) {
        console.error('Failed to set output device:', err);
      }
    },
    [audio, readTwilioAudioState]
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" variant="outline" disabled={!ready}>
          <AudioLines />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="flex w-auto min-w-[420px] flex-col gap-4">
        <span className="font-bold">Audio Settings</span>

        {/* Waveform / Level meter */}
        <MicWaveform
          deviceId={activeInputId}
          enabled={ready && Boolean(activeInputId)}
        />

        {/* Input */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Input Device</span>
          <Select onValueChange={setInputDevice} value={activeInputId}>
            <SelectTrigger className="w-fit">
              <SelectValue placeholder="Select mic input" />
            </SelectTrigger>

            <SelectContent className="w-auto">
              <SelectGroup>
                <SelectLabel>Devices</SelectLabel>
                {inputOptions.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {/* Output */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Output Device</span>

          {!outputSupported ? (
            <span className="text-xs text-muted-foreground">
              Output selection isn’t supported in this browser.
            </span>
          ) : (
            <Select onValueChange={setOutputDevice} value={activeOutputId}>
              <SelectTrigger className="w-fit">
                <SelectValue placeholder="Select speaker output" />
              </SelectTrigger>

              <SelectContent className="w-auto">
                <SelectGroup>
                  <SelectLabel>Devices</SelectLabel>
                  {outputOptions.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default AudioSettingsHoverCard;
