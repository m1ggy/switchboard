import { useTwilioVoice } from '@/hooks/twilio-provider';
import { AudioLines } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const seen = new Set<string>();
  const out: DeviceOption[] = [];

  for (const d of devices) {
    const id = (d.id ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    out.push({
      id,
      label: safeLabel(d.label, fallbackPrefix),
    });
  }

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
    setRms(0);
  }, []);

  const start = useCallback(async () => {
    if (!enabled || !deviceId) return;

    stop();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { ideal: deviceId },
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
    </div>
  );
}

function AudioSettingsHoverCard() {
  const {
    clientRef,
    ready,
    activeCall,
    incomingCall,
    callState,
    audioPrimed,
    ensureAudioPrimed,
  } = useTwilioVoice();
  const audio = clientRef.current?.device?.audio;

  const [open, setOpen] = useState(false);
  const [inputOptions, setInputOptions] = useState<DeviceOption[]>([]);
  const [outputOptions, setOutputOptions] = useState<DeviceOption[]>([]);
  const [activeInputId, setActiveInputId] = useState<string | null>(null);
  const [activeOutputId, setActiveOutputId] = useState<string | null>(null);

  const syncInFlightRef = useRef(false);
  const lastSyncAtRef = useRef(0);

  const hasLiveCall = Boolean(
    activeCall || incomingCall || callState === 'connected'
  );

  const outputSupported = useMemo(
    () => Boolean(audio?.isOutputSelectionSupported),
    [audio]
  );

  const bootstrapAndSync = useCallback(async () => {
    const audio = clientRef.current?.device?.audio;
    if (!audio) return;

    const now = Date.now();
    if (syncInFlightRef.current) return;
    if (now - lastSyncAtRef.current < 1000) return;

    syncInFlightRef.current = true;
    lastSyncAtRef.current = now;

    try {
      let inputs = normalizeDeviceOptions(
        Array.from(audio.availableInputDevices?.entries?.() ?? []).map(
          ([id, device]) => ({
            id,
            label: safeLabel(device.label, 'Microphone'),
          })
        ),
        'Microphone'
      );

      let outputs = normalizeDeviceOptions(
        Array.from(audio.availableOutputDevices?.entries?.() ?? []).map(
          ([id, device]) => ({
            id,
            label: safeLabel(device.label, 'Speaker'),
          })
        ),
        'Speaker'
      );

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

      const currentTwilioInput = (audio.inputDevice?.deviceId ?? '').trim();
      const currentInputValid =
        !!currentTwilioInput && inputs.some((d) => d.id === currentTwilioInput);

      if (currentInputValid) {
        setActiveInputId(currentTwilioInput);
      } else {
        const preferredInput =
          inputs.find((d) => d.id === 'default')?.id ?? inputs[0]?.id ?? null;

        if (preferredInput) {
          try {
            await audio.setInputDevice(preferredInput);
            setActiveInputId(preferredInput);
          } catch (err) {
            console.error('Failed to bootstrap input device:', err);
            setActiveInputId(null);
          }
        } else {
          setActiveInputId(null);
        }
      }

      if (audio.isOutputSelectionSupported) {
        const currentSpeakers = audio.speakerDevices?.get?.();
        const currentArr = currentSpeakers ? Array.from(currentSpeakers) : [];
        const currentSpeakerId =
          currentArr.find((d) => (d.deviceId ?? '').trim())?.deviceId ?? '';

        const normalizedCurrentSpeakerId = currentSpeakerId.trim();
        const outputValid =
          !!normalizedCurrentSpeakerId &&
          outputs.some((d) => d.id === normalizedCurrentSpeakerId);

        const preferredOutput = outputValid
          ? normalizedCurrentSpeakerId
          : (outputs.find((d) => d.id === 'default')?.id ??
            outputs[0]?.id ??
            null);

        if (preferredOutput) {
          try {
            // Important: always force-bind speaker output
            await audio.speakerDevices.set([preferredOutput]);
            setActiveOutputId(preferredOutput);
          } catch (err) {
            console.error('Failed to bootstrap output device:', err);
            setActiveOutputId(null);
          }
        } else {
          setActiveOutputId(null);
        }
      } else {
        setActiveOutputId(null);
      }
    } finally {
      syncInFlightRef.current = false;
    }
  }, [clientRef]);

  useEffect(() => {
    if (!ready || !audioPrimed) return;
    void bootstrapAndSync();
  }, [ready, audioPrimed, bootstrapAndSync]);

  useEffect(() => {
    if (!ready || !audioPrimed) return;
    // Re-bind speaker state around call transitions, especially after hangup
    void bootstrapAndSync();
  }, [callState, ready, audioPrimed, bootstrapAndSync]);

  useEffect(() => {
    const audio = clientRef.current?.device?.audio;
    if (!audio) return;

    const handler = () => {
      void bootstrapAndSync();
    };

    audio.on?.('deviceChange', handler);
    return () => audio.off?.('deviceChange', handler);
  }, [clientRef, bootstrapAndSync]);

  useEffect(() => {
    const handler = () => {
      void bootstrapAndSync();
    };

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

  const inputSelectValue = activeInputId ?? undefined;
  const outputSelectValue = activeOutputId ?? undefined;

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen && !audioPrimed) {
          void ensureAudioPrimed().then(() => bootstrapAndSync());
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button size="icon" variant="outline" disabled={!ready}>
          <AudioLines />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="mr-3 flex w-[420px] max-w-[calc(100vw-24px)] flex-col gap-4 overflow-hidden"
        align="end"
        sideOffset={12}
        avoidCollisions
      >
        <span className="font-bold">Audio Settings</span>

        {!audioPrimed && (
          <Button
            variant="outline"
            onClick={async () => {
              await ensureAudioPrimed();
              await bootstrapAndSync();
            }}
          >
            Enable audio devices
          </Button>
        )}

        <MicWaveform
          deviceId={activeInputId ?? ''}
          enabled={ready && Boolean(activeInputId) && !hasLiveCall}
        />

        {hasLiveCall && (
          <span className="text-xs text-muted-foreground">
            Mic preview is paused during live calls.
          </span>
        )}

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
