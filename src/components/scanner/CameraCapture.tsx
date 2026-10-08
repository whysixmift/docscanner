'use client';

import React, { useEffect } from 'react';
import { useCamera } from '@/hooks/useCamera';
import { SwitchCamera, X, AlertCircle, RefreshCw } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (canvas: HTMLCanvasElement) => void;
  onCancel: () => void;
  onSwitchToUpload: () => void;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({
  onCapture,
  onCancel,
  onSwitchToUpload,
}) => {
  const {
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
  } = useCamera();

  useEffect(() => {
    startCamera('environment');
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  const handleCaptureClick = () => {
    const canvas = captureFrame();
    if (canvas) {
      stopCamera();
      onCapture(canvas);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex w-full flex-col bg-black text-white overflow-hidden">
      {/* Top Header */}
      <div className="z-20 flex shrink-0 items-center justify-between bg-gradient-to-b from-black/90 via-black/60 to-transparent px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-full bg-neutral-900/80 px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:bg-neutral-800 active:scale-95"
        >
          <X className="h-4 w-4" />
          <span>Cancel</span>
        </button>

        <div className="text-xs font-medium tracking-wide text-neutral-200 bg-neutral-900/80 px-3 py-1 rounded-full">
          Position document in frame
        </div>

        <div className="flex items-center gap-2">
          {hasMultipleCameras ? (
            <button
              onClick={switchCamera}
              disabled={isStarting}
              title={`Switch camera (currently ${facingMode})`}
              className="rounded-full bg-neutral-900/80 p-2 text-neutral-200 transition-colors hover:bg-neutral-800 active:scale-95 disabled:opacity-50"
            >
              <SwitchCamera className="h-4 w-4" />
            </button>
          ) : (
            <div className="w-8" />
          )}
        </div>
      </div>

      {/* Camera Viewport Area */}
      <div className="relative flex-1 min-h-0 w-full overflow-hidden flex items-center justify-center">
        {/* Live video */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${
            isActive ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Framing Guide Overlay */}
        {isActive && (
          <div className="pointer-events-none absolute inset-6 flex items-center justify-center md:inset-16">
            <div className="relative h-full w-full max-w-2xl rounded border-2 border-dashed border-white/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
              {/* Corner guide accents */}
              <div className="absolute -top-1 -left-1 h-5 w-5 border-t-4 border-l-4 border-blue-500" />
              <div className="absolute -top-1 -right-1 h-5 w-5 border-t-4 border-r-4 border-blue-500" />
              <div className="absolute -bottom-1 -left-1 h-5 w-5 border-b-4 border-l-4 border-blue-500" />
              <div className="absolute -bottom-1 -right-1 h-5 w-5 border-b-4 border-r-4 border-blue-500" />

              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-black/70 px-3 py-1 text-center font-mono text-[11px] text-neutral-300 backdrop-blur-xs whitespace-nowrap">
                Hold still • Good lighting helps detection
              </div>
            </div>
          </div>
        )}

        {/* Loading / Starting state */}
        {isStarting && !error && (
          <div className="absolute flex flex-col items-center gap-2 text-neutral-400">
            <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
            <span className="text-xs">Initializing camera feed...</span>
          </div>
        )}

        {/* Error handling state */}
        {error && (
          <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 mx-auto max-w-md rounded-lg border border-red-900/60 bg-neutral-900/95 p-6 text-center shadow-2xl">
            <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
            <h3 className="text-sm font-semibold text-neutral-100">Camera Unavailable</h3>
            <p className="mt-1 text-xs text-neutral-400 leading-relaxed">{error}</p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                onClick={() => startCamera()}
                className="flex items-center justify-center gap-1.5 rounded bg-neutral-800 px-3.5 py-2 text-xs font-medium text-neutral-200 transition-colors hover:bg-neutral-700"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Try Again</span>
              </button>
              <button
                onClick={onSwitchToUpload}
                className="flex items-center justify-center gap-1.5 rounded bg-blue-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-500"
              >
                <span>Upload Image Instead</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Capture Shutter Bar */}
      <div className="z-20 flex shrink-0 items-center justify-around bg-gradient-to-t from-black via-black/85 to-transparent px-6 pt-3 pb-8 sm:pb-6">
        <button
          onClick={onSwitchToUpload}
          className="text-xs font-medium text-neutral-400 underline-offset-4 hover:text-neutral-200 hover:underline active:scale-95"
        >
          Choose file
        </button>

        {/* Primary Shutter Button */}
        <button
          onClick={handleCaptureClick}
          disabled={!isActive}
          title="Capture Document"
          aria-label="Capture Document"
          className="group relative flex h-16 w-16 sm:h-[72px] sm:w-[72px] shrink-0 items-center justify-center rounded-full border-4 border-white p-1 shadow-2xl transition-all hover:scale-105 active:scale-90 disabled:pointer-events-none disabled:opacity-40"
        >
          <div className="h-full w-full rounded-full bg-white transition-colors group-hover:bg-neutral-200" />
        </button>

        <div className="w-16" />
      </div>
    </div>
  );
};
