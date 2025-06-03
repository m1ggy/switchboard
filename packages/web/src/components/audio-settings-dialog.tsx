import { useTwilioVoice } from '@/hooks/twilio-provider';
import { AudioLines } from 'lucide-react';
import { useEffect, useState } from 'react';
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
function AudioSettingsHoverCard() {
  const { clientRef } = useTwilioVoice();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeInputDevice, setActiveInputDevice] =
    useState<MediaDeviceInfo | null>(null);

  const [activeOutputDevice, setActiveOutputDevice] =
    useState<MediaDeviceInfo | null>(null);

  useEffect(() => {
    const getDevicesWithPermission = async () => {
      try {
        // Prompt the user for permission
        await navigator.mediaDevices.getUserMedia({ audio: true });

        const mediaDevices = await navigator.mediaDevices.enumerateDevices();

        setDevices(mediaDevices);
      } catch (err) {
        console.error('Microphone permission denied or error:', err);
      }
    };

    getDevicesWithPermission();
  }, []);

  useEffect(() => {
    if (clientRef.current && devices.length) {
      const matchingDevice = devices.find(
        (device) =>
          device.deviceId ===
          clientRef.current?.device?.audio?.inputDevice?.deviceId
      );

      console.log({ clientRef, matchingDevice });

      if (matchingDevice) setActiveInputDevice(matchingDevice);

      const matchingOutputDevice = devices.find(
        (device) =>
          device.deviceId ===
          clientRef.current?.device?.audio?.audioConstraints?.deviceId
      );

      console.log({ matchingOutputDevice });
    }
  }, [clientRef.current, devices]);

  useEffect(() => {
    console.log({ device: clientRef.current?.device });
  }, [clientRef.current?.device]);

  const setDevice = (device: string, type: 'input' | 'output') => {
    console.log({ device, clientRef });
    if (clientRef.current) {
      clientRef.current.device?.audio?.setInputDevice(device);

      const selectedDevice = devices.find((dev) => dev.deviceId === device);
      if (!selectedDevice) return;

      if (type === 'input') setActiveInputDevice(selectedDevice);
      else if (type === 'output') setActiveOutputDevice(selectedDevice);
    }
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size={'icon'} variant={'outline'}>
          <AudioLines />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="flex flex-col gap-4 w-auto min-w-[400px]">
        <span className="font-bold">Audio Settings</span>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Input Device</span>
          <Select
            onValueChange={(val) => setDevice(val, 'input')}
            value={activeInputDevice?.deviceId ?? ''}
          >
            <SelectTrigger className="w-fit">
              <SelectValue placeholder="select mic input" className="w-auto" />
              <SelectContent className="w-auto">
                <SelectGroup>
                  <SelectLabel>Devices</SelectLabel>
                  {devices
                    .filter((device) => device.kind === 'audioinput')
                    .map((device) => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>
                        {device.label}
                      </SelectItem>
                    ))}
                </SelectGroup>
              </SelectContent>
            </SelectTrigger>
          </Select>
        </div>
        {/* <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Output Device</span>
          <Select onValueChange={(val) => setDevice(val, 'output')}>
            <SelectTrigger className="w-fit">
              <SelectValue placeholder="select mic input" className="w-auto" />
              <SelectContent className="w-auto">
                <SelectGroup>
                  <SelectLabel>Devices</SelectLabel>
                  {devices
                    .filter((device) => device.kind === 'audiooutput')
                    .map((device) => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>
                        {device.label}
                      </SelectItem>
                    ))}
                </SelectGroup>
              </SelectContent>
            </SelectTrigger>
          </Select>
        </div> */}
      </PopoverContent>
    </Popover>
  );
}

export default AudioSettingsHoverCard;
