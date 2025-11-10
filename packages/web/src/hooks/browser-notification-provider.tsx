import {
  createContext,
  type FC,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

interface NotificationContextType {
  permission: NotificationPermission;
  startTabNotification: (message?: string) => void;
  stopTabNotification: () => void;
  showSystemNotification: (
    title: string,
    options?: NotificationOptions
  ) => void;
  enableVisibilityNotification: (message?: string) => () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined
);

export const useNotification = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      'useNotification must be used within a NotificationProvider'
    );
  }
  return context;
};

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: FC<NotificationProviderProps> = ({
  children,
}) => {
  const isClient =
    typeof window !== 'undefined' && typeof document !== 'undefined';
  const isNotificationSupported =
    isClient && typeof (window as any).Notification !== 'undefined';

  const initialPermission: NotificationPermission = isNotificationSupported
    ? Notification.permission
    : 'denied';

  const [permission, setPermission] =
    useState<NotificationPermission>(initialPermission);

  const originalTitle = useRef<string>('');
  const intervalId = useRef<ReturnType<typeof setInterval> | null>(null);

  // Capture initial title on client
  useEffect(() => {
    if (!isClient) return;
    originalTitle.current = document.title;
  }, [isClient]);

  // Request permission (client + supported only)
  useEffect(() => {
    if (!isNotificationSupported) return;

    if (Notification.permission === 'default') {
      Notification.requestPermission().then((result) => {
        setPermission(result);
      });
    } else {
      setPermission(Notification.permission);
    }
  }, [isNotificationSupported]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalId.current) {
        clearInterval(intervalId.current);
        intervalId.current = null;
      }
      if (isClient && originalTitle.current) {
        document.title = originalTitle.current;
      }
    };
  }, [isClient]);

  const startTabNotification = (message: string = '🔔 New Notification!') => {
    if (!isClient) return;
    if (!intervalId.current) {
      intervalId.current = setInterval(() => {
        document.title =
          document.title === originalTitle.current
            ? message
            : originalTitle.current;
      }, 1000);
    }
  };

  const stopTabNotification = () => {
    if (!isClient) return;
    if (intervalId.current) {
      clearInterval(intervalId.current);
      intervalId.current = null;
      document.title = originalTitle.current || document.title;
    }
  };

  const fallbackNotify = (title: string) => {
    if (!isClient) return;
    // Light haptic hint on supported devices
    if ('vibrate' in navigator) {
      navigator.vibrate(200);
    }
  };

  const showSystemNotification = (
    title: string,
    options?: NotificationOptions
  ) => {
    if (!isNotificationSupported) {
      fallbackNotify(title);
      return;
    }

    if (permission === 'granted') {
      try {
        new Notification(title, options);
      } catch (e) {
        // Some environments (e.g., iOS non-PWA) may still throw
        fallbackNotify(title);
      }
    } else if (permission === 'default') {
      // Ask once, then try again
      Notification.requestPermission().then((result) => {
        setPermission(result);
        if (result === 'granted') {
          try {
            new Notification(title, options);
          } catch {
            fallbackNotify(title);
          }
        } else {
          fallbackNotify(title);
        }
      });
    } else {
      // 'denied'
      fallbackNotify(title);
    }
  };

  const enableVisibilityNotification = (
    message: string = '🔔 New Notification!'
  ) => {
    if (!isClient) return () => {};

    const handleVisibilityChange = () => {
      if (document.hidden) {
        startTabNotification(message);
      } else {
        stopTabNotification();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopTabNotification();
    };
  };

  return (
    <NotificationContext.Provider
      value={{
        permission,
        startTabNotification,
        stopTabNotification,
        showSystemNotification,
        enableVisibilityNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};
