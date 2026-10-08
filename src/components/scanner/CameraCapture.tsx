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
    <div className="fixed inset-0 z-50 flex flex-col justify-between overflow-hidden bg-black text-white touch-none select-none">
      {/* Layer 1: Background Camera Feed Viewport */}
      <div className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden pointer-events-none">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            height: '100%',
            maxWidth: '100vw',
            maxHeight: '100vh',
            objectFit: 'contain',
          }}
          className={`transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0'}`}
        />

        {/* Clean Framing Box (No 9999px box-shadow bug) */}
        {isActive && (
          <div className="absolute inset-6 md:inset-16 flex items-center justify-center">
            <div className="relative h-full w-full max-w-lg rounded-xl border-2 border-dashed border-white/70">
              {/* Corner guide accents */}
              <div className="absolute -top-1 -left-1 h-5 w-5 border-t-4 border-l-4 border-blue-500 rounded-tl" />
              <div className="absolute -top-1 -right-1 h-5 w-5 border-t-4 border-r-4 border-blue-500 rounded-tr" />
              <div className="absolute -bottom-1 -left-1 h-5 w-5 border-b-4 border-l-4 border-blue-500 rounded-bl" />
              <div className="absolute -bottom-1 -right-1 h-5 w-5 border-b-4 border-r-4 border-blue-500 rounded-br" />

              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/75 px-3.5 py-1 font-mono text-[11px] text-neutral-300 backdrop-blur-sm whitespace-nowrap border border-white/10">
                Posisikan dokumen dalam bingkai
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Layer 2: Top Floating Controls */}
      <div className="relative z-10 flex shrink-0 items-center justify-between p-4 pt-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-full bg-neutral-900/90 border border-neutral-700/60 px-3.5 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:bg-neutral-800 active:scale-95"
        >
          <X className="h-4 w-4" />
          <span>Cancel</span>
        </button>

        <div className="flex items-center gap-2">
          {hasMultipleCameras ? (
            <button
              onClick={switchCamera}
              disabled={isStarting}
              title="Ganti kamera"
              className="rounded-full bg-neutral-900/90 border border-neutral-700/60 p-2 text-neutral-200 transition-colors hover:bg-neutral-800 active:scale-95 disabled:opacity-50"
            >
              <SwitchCamera className="h-4 w-4" />
            </button>
          ) : (
            <div className="w-8" />
          )}
        </div>
      </div>

      {/* Center Alerts (Loading / Error) */}
      {(!isActive || error) && (
        <div className="relative z-10 flex flex-1 items-center justify-center p-6">
          {isStarting && !error && (
            <div className="flex flex-col items-center gap-2 rounded-xl bg-black/80 p-4 text-neutral-300 backdrop-blur-md border border-neutral-800">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
              <span className="text-xs">Memuat feed kamera...</span>
            </div>
          )}

          {error && (
            <div className="mx-auto max-w-xs rounded-xl border border-red-900/80 bg-neutral-900/95 p-5 text-center shadow-2xl">
              <AlertCircle className="mx-auto mb-2 h-7 w-7 text-red-400" />
              <h3 className="text-xs font-semibold text-neutral-100">Kamera Tidak Tersedia</h3>
              <p className="mt-1 text-[11px] text-neutral-400 leading-relaxed">{error}</p>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  onClick={() => startCamera()}
                  className="rounded bg-neutral-800 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
                >
                  Coba Lagi
                </button>
                <button
                  onClick={onSwitchToUpload}
                  className="rounded bg-blue-600 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
                >
                  Upload Gambar Saja
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Layer 3: Bottom Floating Shutter Controls */}
      <div className="relative z-10 flex shrink-0 items-center justify-around p-6 pb-12 sm:pb-8 bg-gradient-to-t from-black via-black/85 to-transparent">
        <button
          onClick={onSwitchToUpload}
          className="text-xs font-medium text-neutral-300 underline-offset-4 hover:text-white hover:underline active:scale-95"
        >
          Pilih file
        </button>

        {/* Shutter Button */}
        <button
          onClick={handleCaptureClick}
          disabled={!isActive}
          title="Ambil Foto Dokumen"
          aria-label="Ambil Foto Dokumen"
          className="group relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-white p-1 shadow-2xl transition-all hover:scale-105 active:scale-90 disabled:pointer-events-none disabled:opacity-40"
        >
          <div className="h-full w-full rounded-full bg-white transition-colors group-hover:bg-neutral-200" />
        </button>

        <div className="w-16" />
      </div>
    </div>
  );
};
