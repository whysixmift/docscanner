'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useOpenCV } from '@/hooks/useOpenCV';
import { QuadCorners, DetectionResult } from '@/lib/opencv/types';
import { detectDocument, getDefaultCorners } from '@/lib/opencv/detector';
import { warpPerspectiveDoc } from '@/lib/opencv/perspective';
import { readFileAsDataURL, loadImage, rotateCanvas } from '@/lib/image/utils';
import { CameraCapture } from './CameraCapture';
import { DocumentCornerEditor } from './DocumentCornerEditor';
import { ScanEnhancer } from './ScanEnhancer';
import {
  Camera,
  Upload,
  AlertCircle,
  RefreshCw,
  FileCheck,
  ChevronLeft,
} from 'lucide-react';

// Langkah-langkah navigasi scanner
type ScannerStep = 'home' | 'camera' | 'detecting' | 'adjust' | 'result';

export const ScannerApp: React.FC = () => {
  // Hook OpenCV instance
  const {
    isReady: isOpenCvReady,
    isLoading: isOpenCvLoading,
    statusText,
    error: openCvError,
    retry: retryOpenCv,
  } = useOpenCV();

  const [step, setStep] = useState<ScannerStep>('home');
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | HTMLCanvasElement | null>(null);
  const [corners, setCorners] = useState<QuadCorners | null>(null);
  const [detectionMessage, setDetectionMessage] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [warpedCanvas, setWarpedCanvas] = useState<HTMLCanvasElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Proses gambar sumber ke pipeline deteksi sudut
  const processImageForDetection = useCallback(
    async (source: HTMLImageElement | HTMLCanvasElement) => {
      setSourceImage(source);
      setStep('detecting');
      setIsDetecting(true);
      setDetectionMessage(null);

      try {
        const detection: DetectionResult = await detectDocument(source);
        setCorners(detection.corners);

        if (!detection.found) {
          setDetectionMessage(detection.message || 'Auto-detection low confidence. Please adjust corners manually.');
        } else {
          setDetectionMessage(null);
        }

        setStep('adjust');
      } catch (err: unknown) {
        console.error('Detection pipeline error:', err);
        const w = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
        const h = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
        setCorners(getDefaultCorners(w, h));
        setDetectionMessage('Automatic boundary detection failed. Manual handles are ready.');
        setStep('adjust');
      } finally {
        setIsDetecting(false);
      }
    },
    []
  );

  // Input via upload file gambar
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await readFileAsDataURL(file);
      const img = await loadImage(dataUrl);
      await processImageForDetection(img);
    } catch (err: unknown) {
      console.error('Image load error:', err);
      alert('Could not read the selected image file. Please provide a valid JPG or PNG.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Input via drag and drop
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    try {
      const dataUrl = await readFileAsDataURL(file);
      const img = await loadImage(dataUrl);
      await processImageForDetection(img);
    } catch (err) {
      console.error('Drop error:', err);
    }
  };

  // Tangkap frame gambar dari kamera
  const handleCameraCapture = async (canvas: HTMLCanvasElement) => {
    await processImageForDetection(canvas);
  };

  // Putar orientasi gambar 90 derajat
  const handleRotateSource = async () => {
    if (!sourceImage) return;

    const baseCanvas = document.createElement('canvas');
    const w = sourceImage instanceof HTMLImageElement ? sourceImage.naturalWidth : sourceImage.width;
    const h = sourceImage instanceof HTMLImageElement ? sourceImage.naturalHeight : sourceImage.height;
    baseCanvas.width = w;
    baseCanvas.height = h;
    const ctx = baseCanvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(sourceImage, 0, 0);

    const rotated = rotateCanvas(baseCanvas, 90);
    await processImageForDetection(rotated);
  };

  // Jalankan ulang auto deteksi batas kertas
  const handleReRunAutoDetect = async () => {
    if (!sourceImage) return;
    setIsDetecting(true);
    try {
      const detection = await detectDocument(sourceImage);
      setCorners(detection.corners);
      if (!detection.found) {
        setDetectionMessage('Auto-detection low confidence. Adjust corners manually.');
      } else {
        setDetectionMessage('Document corners detected.');
      }
    } catch (err: unknown) {
      console.error('Re-detect error:', err);
    } finally {
      setIsDetecting(false);
    }
  };

  // Konfirmasi 4 titik sudut & luruskan dokumen (perspective warp)
  const handleConfirmCorners = async () => {
    if (!sourceImage || !corners) return;

    setStep('detecting');
    try {
      const warped = await warpPerspectiveDoc(sourceImage, corners);
      setWarpedCanvas(warped);
      setStep('result');
    } catch (err: unknown) {
      console.error('Perspective transform failed:', err);
      alert('Failed to straighten document. Please adjust the corners and try again.');
      setStep('adjust');
    }
  };

  // Reset to scan a fresh document
  const handleResetForNewScan = () => {
    setSourceImage(null);
    setCorners(null);
    setWarpedCanvas(null);
    setStep('home');
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-neutral-950 font-sans text-neutral-100 antialiased selection:bg-neutral-800">
      {/* Top Application Header */}
      <header className="flex h-12 items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <div className="flex h-6 w-6 items-center justify-center rounded border border-neutral-700 bg-neutral-900 font-mono text-xs font-semibold text-neutral-200">
              DS
            </div>
            <h1 className="text-xs font-semibold tracking-wider text-neutral-200 uppercase">
              DocScanner
            </h1>
          </div>

          <span className="hidden text-neutral-600 sm:inline">•</span>
          <span className="hidden text-xs text-neutral-400 sm:inline">
            Client-Side Document Scanner
          </span>
        </div>

        {/* OpenCV Status Indicator */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 text-xs text-neutral-400">
            <span
              className={`h-2 w-2 rounded-full ${
                isOpenCvReady
                  ? 'bg-emerald-500 ring-2 ring-emerald-500/20'
                  : isOpenCvLoading
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-red-500'
              }`}
            />
            <span className="font-mono text-[11px] text-neutral-400">
              {isOpenCvReady
                ? 'CV Ready'
                : isOpenCvLoading
                ? `Loading Engine (${statusText})`
                : 'CV Engine Error'}
            </span>
          </div>

          {step !== 'home' && (
            <button
              onClick={handleResetForNewScan}
              className="flex items-center gap-1 rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:border-neutral-700 hover:text-white"
            >
              <ChevronLeft className="h-3 w-3" />
              <span>New Scan</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="relative flex flex-1 flex-col overflow-hidden">
        {/* Loading overlay if OpenCV failed or initializing */}
        {openCvError && (
          <div className="absolute inset-x-4 top-4 z-50 flex items-center justify-between rounded border border-red-900 bg-red-950/90 p-3 text-xs text-red-200">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>Computer vision engine failed to initialize: {openCvError}</span>
            </div>
            <button
              onClick={retryOpenCv}
              className="ml-3 shrink-0 rounded border border-red-800 bg-red-900/60 px-2.5 py-1 text-[11px] font-medium text-red-100 hover:bg-red-800"
            >
              Retry
            </button>
          </div>
        )}

        {/* 1. HOME SCREEN */}
        {step === 'home' && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="flex flex-1 flex-col items-center justify-center p-6 text-center"
          >
            <div className="w-full max-w-lg space-y-8">
              {/* App Description */}
              <div className="space-y-2">
                <h2 className="text-xl font-semibold tracking-tight text-neutral-100 sm:text-2xl">
                  Scan a document
                </h2>
                <p className="text-xs text-neutral-400 leading-relaxed sm:text-sm">
                  Detect boundaries, straighten perspective, and produce clean photocopy-grade scans client-side.
                </p>
              </div>

              {/* Primary Action Buttons */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Camera Action */}
                <button
                  onClick={() => setStep('camera')}
                  disabled={isOpenCvLoading}
                  className="group flex flex-col items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900/80 p-6 text-neutral-200 transition-all hover:border-neutral-700 hover:bg-neutral-850 active:scale-98 disabled:opacity-50"
                >
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 transition-colors group-hover:border-blue-500/50 group-hover:text-blue-400">
                    <Camera className="h-6 w-6 text-neutral-300 group-hover:text-blue-400" />
                  </div>
                  <span className="text-sm font-medium">Use Camera</span>
                  <span className="mt-1 text-xs text-neutral-500">Capture with webcam or phone camera</span>
                </button>

                {/* Upload Action */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isOpenCvLoading}
                  className="group flex flex-col items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900/80 p-6 text-neutral-200 transition-all hover:border-neutral-700 hover:bg-neutral-850 active:scale-98 disabled:opacity-50"
                >
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 transition-colors group-hover:border-blue-500/50 group-hover:text-blue-400">
                    <Upload className="h-6 w-6 text-neutral-300 group-hover:text-blue-400" />
                  </div>
                  <span className="text-sm font-medium">Upload Image</span>
                  <span className="mt-1 text-xs text-neutral-500">Select file or drag & drop</span>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/bmp,image/tiff"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              {/* Privacy badge */}
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-neutral-500">
                <FileCheck className="h-3.5 w-3.5 text-emerald-500" />
                <span>100% Client-side. Images never leave your browser.</span>
              </div>
            </div>
          </div>
        )}

        {/* 2. CAMERA MODE */}
        {step === 'camera' && (
          <CameraCapture
            onCapture={handleCameraCapture}
            onCancel={() => setStep('home')}
            onSwitchToUpload={() => {
              setStep('home');
              setTimeout(() => fileInputRef.current?.click(), 100);
            }}
          />
        )}

        {/* 3. DETECTING / PROCESSING SPINNER */}
        {step === 'detecting' && (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-neutral-300">
            <RefreshCw className="mb-3 h-8 w-8 animate-spin text-blue-500" />
            <h3 className="text-sm font-medium">Detecting document geometry...</h3>
            <p className="mt-1 text-xs text-neutral-500">
              Running Canny edge filtering and contour approximation
            </p>
          </div>
        )}

        {/* 4. CORNER ADJUSTMENT / CONFIRMATION */}
        {step === 'adjust' && sourceImage && corners && (
          <DocumentCornerEditor
            imageElement={sourceImage}
            corners={corners}
            onChangeCorners={setCorners}
            onConfirm={handleConfirmCorners}
            onAutoDetect={handleReRunAutoDetect}
            onRotateSource={handleRotateSource}
            isDetecting={isDetecting}
            detectionMessage={detectionMessage}
          />
        )}

        {/* 5. RESULT PREVIEW & ENHANCEMENT */}
        {step === 'result' && warpedCanvas && (
          <ScanEnhancer
            warpedCanvas={warpedCanvas}
            onReCrop={() => setStep('adjust')}
            onReset={handleResetForNewScan}
          />
        )}
      </main>
    </div>
  );
};
