'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isActive: boolean;
  isStarting: boolean;
  error: string | null;
  facingMode: 'environment' | 'user';
  hasMultipleCameras: boolean;
  startCamera: (mode?: 'environment' | 'user') => Promise<void>;
  stopCamera: () => void;
  switchCamera: () => Promise<void>;
  captureFrame: () => HTMLCanvasElement | null;
}

export function useCamera(): UseCameraReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isActive, setIsActive] = useState<boolean>(false);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState<boolean>(false);

  // Check available video inputs
  useEffect(() => {
    async function checkDevices() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
        return;
      }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        setHasMultipleCameras(videoInputs.length > 1);
      } catch {
        // Ignore device listing error
      }
    }
    checkDevices();
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
    setIsStarting(false);
  }, []);

  const startCamera = useCallback(
    async (mode: 'environment' | 'user' = facingMode) => {
      stopCamera();
      setIsStarting(true);
      setError(null);

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setError('Camera API is not supported in this browser environment');
        setIsStarting(false);
        return;
      }

      try {
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        setFacingMode(mode);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true'); // Required for iOS Safari
          try {
            await videoRef.current.play();
          } catch (playErr: unknown) {
            const error = playErr instanceof DOMException ? playErr : null;
            if (error && error.name !== 'AbortError') {
              throw error;
            }
          }
        }

        setIsActive(true);
      } catch (err: unknown) {
        const domError = err instanceof DOMException ? err : null;
        if (domError?.name === 'AbortError') {
          return;
        }
        console.error('Camera access error:', err);
        let userMessage = 'Failed to access camera';
        if (domError?.name === 'NotAllowedError' || domError?.name === 'PermissionDeniedError') {
          userMessage = 'Camera permission was denied. Please allow camera access in your browser settings or upload an image instead.';
        } else if (domError?.name === 'NotFoundError' || domError?.name === 'DevicesNotFoundError') {
          userMessage = 'No camera device found on this system.';
        } else if (domError?.name === 'NotReadableError' || domError?.name === 'TrackStartError') {
          userMessage = 'Camera is currently in use by another application or tab.';
        } else if (err instanceof Error && err.message) {
          userMessage = err.message;
        }
        setError(userMessage);
        setIsActive(false);
      } finally {
        setIsStarting(false);
      }
    },
    [facingMode, stopCamera]
  );

  const switchCamera = useCallback(async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    await startCamera(nextMode);
  }, [facingMode, startCamera]);

  const captureFrame = useCallback((): HTMLCanvasElement | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    videoRef,
    isActive,
    isStarting,
    error,
    facingMode,
    hasMultipleCameras,
    startCamera,
    stopCamera,
    switchCamera,
    captureFrame,
  };
}
