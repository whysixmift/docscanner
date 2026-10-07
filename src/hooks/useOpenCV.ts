'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  loadOpenCV,
  isOpenCVReady,
  getOpenCVInstance,
  subscribeOpenCVStatus,
  resetOpenCVLoader,
} from '@/lib/opencv/loader';

export interface UseOpenCVReturn {
  isReady: boolean;
  isLoading: boolean;
  statusText: string;
  error: string | null;
  retry: () => void;
  cv: Record<string, unknown> | null;
}

export function useOpenCV(): UseOpenCVReturn {
  const [isReady, setIsReady] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [statusText, setStatusText] = useState<string>('Connecting...');
  const [error, setError] = useState<string | null>(null);
  const [cvInstance, setCvInstance] = useState<Record<string, unknown> | null>(null);

  // Subscribe to granular loader progress messages
  useEffect(() => {
    const unsubscribe = subscribeOpenCVStatus((status) => {
      setStatusText(status);
    });
    return unsubscribe;
  }, []);

  const initialize = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (isOpenCVReady()) {
        const readyCv = getOpenCVInstance();
        setCvInstance(readyCv);
        setIsReady(true);
        setIsLoading(false);
        return;
      }

      const cv = await loadOpenCV();
      setCvInstance(cv);
      setIsReady(true);
      setIsLoading(false);
    } catch (err: unknown) {
      console.error('Failed to load OpenCV:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to initialize computer vision engine. Check your connection.'
      );
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const retry = useCallback(() => {
    resetOpenCVLoader();
    void initialize();
  }, [initialize]);

  return { isReady, isLoading, statusText, error, retry, cv: cvInstance };
}
