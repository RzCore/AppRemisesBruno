import { useEffect, useRef } from 'react';
import { appUsageService } from '@/lib/api';

export const useAppTracking = (action: string, details?: any) => {
  const trackedRef = useRef<string | null>(null);
  const serializedDetails = details !== undefined ? JSON.stringify(details) : '';

  useEffect(() => {
    const key = `${action}::${serializedDetails}`;
    if (trackedRef.current === key) return;
    trackedRef.current = key;

    const trackAction = async () => {
      try {
        await appUsageService.track(action, details);
      } catch (error) {
        console.error('Error tracking app usage:', error);
      }
    };

    trackAction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, serializedDetails]);
};

export const trackAppAction = async (action: string, details?: any) => {
  try {
    await appUsageService.track(action, details);
  } catch (error) {
    console.error('Error tracking app action:', error);
  }
}; 