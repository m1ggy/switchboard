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
  const [permission, setPermission] = useState<NotificationPermission>(
    Notification.permission
  );
  const originalTitle = useRef<string>(document.title);
  const intervalId = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission().then((result) => {
        setPermission(result);
      });
    } else {
      setPermission(Notification.permission);
    }
  }, []);

  const startTabNotification = (message: string = '🔔 New Notification!') => {
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
    if (intervalId.current) {
      clearInterval(intervalId.current);
      intervalId.current = null;
      document.title = originalTitle.current;
    }
  };

  const showSystemNotification = (
    title: string,
    options?: NotificationOptions
  ) => {
    if (permission === 'granted') {
      new Notification(title, options);
    }
  };

  const enableVisibilityNotification = (
    message: string = '🔔 New Notification!'
  ) => {
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
