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

function safeLabel(raw: string | undefined | null, fallback: string) {
  const s = (raw ?? '').trim();
  return s.length ? s : fallback;
}

function normalizeDeviceOptions(
  devices: Array<{ id: string; label: string }>,
  fallbackPrefix: string
): DeviceOption[] {
  // Ensure:
  // - no empty ids
  // - no empty labels
  // - stable + readable labels
  // - de-dupe by id
  const seen = new Set<string>();
  const out: DeviceOption[] = [];

  for (const d of devices) {
    const id = (d.id ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    out.push({
      id,
      label: safeLabel(d.label, `${fallbackPrefix}`),
    });
  }

  // If multiple devices share the same label, append a short suffix for clarity
  const counts = out.reduce<Record<string, number>>((acc, d) => {
    acc[d.label] = (acc[d.label] ?? 0) + 1;
    return acc;
  }, {});
  return out.map((d) => {
    if ((counts[d.label] ?? 0) <= 1) return d;
    const suffix = d.id.length >= 6 ? d.id.slice(-6) : d.id;
    return { ...d, label: `${d.label} (${suffix})` };
  });
}

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
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    analyserRef.current = null;
    dataRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!enabled || !deviceId) return;

    stop();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // NOTE: on some mobile browsers, exact can fail; consider ideal if you hit issues
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

        ctx2d.clearRect(0, 0, width, height);

        ctx2d.lineWidth = 2;
        ctx2d.beginPath();

        let sumSq = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sumSq += v * v;

          const x = (i / (data.length - 1)) * width;
          const y = (0.5 + v * 0.45) * height;

          if (i === 0) ctx2d.moveTo(x, y);
          else ctx2d.lineTo(x, y);
        }

        ctx2d.stroke();

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
        <canvas ref={canvasRef} height={height} className="h-12 w-full" />
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

      const targetWidth = Math.max(1, Math.floor(rect.width * dpr));
      const targetHeight = Math.max(1, Math.floor(canvas.height * dpr));

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

  // IMPORTANT: use null instead of '' so we never feed Radix Select an empty string
  const [activeInputId, setActiveInputId] = useState<string | null>(null);
  const [activeOutputId, setActiveOutputId] = useState<string | null>(null);

  const outputSupported = useMemo(
    () => Boolean(audio?.isOutputSelectionSupported),
    [audio]
  );

  const bootstrapAndSync = useCallback(async () => {
    const audio = clientRef.current?.device?.audio;
    if (!audio) return;

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error('Microphone permission denied or error:', err);
    }

    // --- Gather devices from Twilio ---
    const twilioInputsRaw: DeviceOption[] = [];
    audio.availableInputDevices?.forEach((device, id) => {
      twilioInputsRaw.push({
        id,
        label: safeLabel(device.label, 'Microphone'),
      });
    });

    const twilioOutputsRaw: DeviceOption[] = [];
    audio.availableOutputDevices?.forEach((device, id) => {
      twilioOutputsRaw.push({
        id,
        label: safeLabel(device.label, 'Speaker'),
      });
    });

    let inputs = normalizeDeviceOptions(twilioInputsRaw, 'Microphone');
    let outputs = normalizeDeviceOptions(twilioOutputsRaw, 'Speaker');

    // --- Fallback to enumerateDevices if Twilio didn’t give us lists ---
    if (!inputs.length || !outputs.length) {
      try {
        const mediaDevices = await navigator.mediaDevices.enumerateDevices();

        if (!inputs.length) {
          inputs = normalizeDeviceOptions(
            mediaDevices
              .filter((d) => d.kind === 'audioinput')
              .map((d) => ({
                id: d.deviceId,
                label: safeLabel(d.label, 'Microphone'),
              })),
            'Microphone'
          );
        }

        if (!outputs.length) {
          outputs = normalizeDeviceOptions(
            mediaDevices
              .filter((d) => d.kind === 'audiooutput')
              .map((d) => ({
                id: d.deviceId,
                label: safeLabel(d.label, 'Speaker'),
              })),
            'Speaker'
          );
        }
      } catch (err) {
        console.error('enumerateDevices error:', err);
      }
    }

    setInputOptions(inputs);
    setOutputOptions(outputs);

    // --- Ensure current input is valid; otherwise pick a sane default ---
    const currentTwilioInput = (audio.inputDevice?.deviceId ?? '').trim();
    const currentInputValid =
      !!currentTwilioInput && inputs.some((d) => d.id === currentTwilioInput);

    if (!currentInputValid) {
      const preferred =
        inputs.find((d) => d.id === 'default')?.id ?? inputs[0]?.id ?? null;

      if (preferred) {
        try {
          await audio.setInputDevice(preferred);
          setActiveInputId(preferred);
        } catch (err) {
          console.error('Failed to bootstrap Twilio input device:', err);
          setActiveInputId(null);
        }
      } else {
        setActiveInputId(null);
      }
    } else {
      setActiveInputId(currentTwilioInput);
    }

    // --- Output device: validate and store (only if supported) ---
    if (audio.isOutputSelectionSupported) {
      const currentSpeakers = audio.speakerDevices?.get?.();
      const currentArr = currentSpeakers ? Array.from(currentSpeakers) : [];
      const first = currentArr.find((d) => (d.deviceId ?? '').trim())?.deviceId;

      const normalizedFirst = (first ?? '').trim();
      const outputValid =
        !!normalizedFirst && outputs.some((d) => d.id === normalizedFirst);

      setActiveOutputId(outputValid ? normalizedFirst : null);
    } else {
      setActiveOutputId(null);
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

  const setInputDevice = useCallback(
    async (deviceId: string) => {
      if (!audio) return;
      const id = (deviceId ?? '').trim();
      if (!id) return;

      try {
        await audio.setInputDevice(id);
        setActiveInputId(id);
      } catch (err) {
        console.error('Failed to set input device:', err);
      }
    },
    [audio]
  );

  const setOutputDevice = useCallback(
    async (deviceId: string) => {
      if (!audio) return;
      if (!audio.isOutputSelectionSupported) return;

      const id = (deviceId ?? '').trim();
      if (!id) return;

      try {
        await audio.speakerDevices.set([id]);
        setActiveOutputId(id);
      } catch (err) {
        console.error('Failed to set output device:', err);
      }
    },
    [audio]
  );

  const inputSelectValue = activeInputId ?? undefined; // ✅ never ''
  const outputSelectValue = activeOutputId ?? undefined; // ✅ never ''

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" variant="outline" disabled={!ready}>
          <AudioLines />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="flex w-[420px] max-w-[calc(100vw-24px)] flex-col gap-4 overflow-hidden mr-3"
        align="end"
        sideOffset={12}
        avoidCollisions
      >
        <span className="font-bold">Audio Settings</span>

        <MicWaveform
          deviceId={activeInputId ?? ''}
          enabled={ready && Boolean(activeInputId)}
        />

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Input Device</span>
          <Select onValueChange={setInputDevice} value={inputSelectValue}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select mic input" />
            </SelectTrigger>

            <SelectContent className="w-[420px] max-w-[calc(100vw-24px)]">
              <SelectGroup>
                <SelectLabel>Devices</SelectLabel>
                {inputOptions.map((d) => (
                  <SelectItem key={d.id} value={d.id} className="max-w-full">
                    <span className="block max-w-full truncate">{d.label}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Output Device</span>

          {!outputSupported ? (
            <span className="text-xs text-muted-foreground">
              Output selection isn’t supported in this browser.
            </span>
          ) : (
            <Select onValueChange={setOutputDevice} value={outputSelectValue}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select speaker output" />
              </SelectTrigger>

              <SelectContent className="w-[420px] max-w-[calc(100vw-24px)]">
                <SelectGroup>
                  <SelectLabel>Devices</SelectLabel>
                  {outputOptions.map((d) => (
                    <SelectItem key={d.id} value={d.id} className="max-w-full">
                      <span className="block max-w-full truncate">
                        {d.label}
                      </span>
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
