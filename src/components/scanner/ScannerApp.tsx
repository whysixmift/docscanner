'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useOpenCV } from '@/hooks/useOpenCV';
import { QuadCorners, ScannedPage, DetectionResult } from '@/lib/opencv/types';
import { detectDocument, getDefaultCorners } from '@/lib/opencv/detector';
import { warpPerspectiveDoc } from '@/lib/opencv/perspective';
import { readFileAsDataURL, loadImage, rotateCanvas } from '@/lib/image/utils';
import { CameraCapture } from './CameraCapture';
import { DocumentCornerEditor } from './DocumentCornerEditor';
import { ScanEnhancer } from './ScanEnhancer';
import { MultiPageTray } from './MultiPageTray';
import {
  Camera,
  Upload,
  FileText,
  AlertCircle,
  RefreshCw,
  FileCheck,
  ChevronLeft,
} from 'lucide-react';

type ScannerStep = 'home' | 'camera' | 'detecting' | 'adjust' | 'result';

export const ScannerApp: React.FC = () => {
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

  // Multi-page document session
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [activePageId, setActivePageId] = useState<string>('page-1');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Process a loaded image/canvas through the OpenCV detection pipeline
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

  // Handle file upload
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

  // Drag and drop image
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

  // Camera frame captured
  const handleCameraCapture = async (canvas: HTMLCanvasElement) => {
    await processImageForDetection(canvas);
  };

  // Rotate source image 90 degrees
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

  // Re-run auto detect on current source
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

  // Confirm corner selection and perform perspective transform
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

  // Add page to session
  const handleAddPage = (page: ScannedPage) => {
    setPages((prev) => {
      const existing = prev.findIndex((p) => p.id === page.id);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = page;
        return next;
      }
      return [...prev, page];
    });
    // Reset to scan another page
    handleResetForNewScan();
  };

  // Reset to scan a fresh page
  const handleResetForNewScan = () => {
    setSourceImage(null);
    setCorners(null);
    setWarpedCanvas(null);
    setActivePageId(`page-${Date.now()}`);
    setStep('home');
  };

  // Total reset
  const handleTotalReset = () => {
    setPages([]);
    handleResetForNewScan();
  };

  // Select page from tray
  const handleSelectPage = async (pageId: string) => {
    const page = pages.find((p) => p.id === pageId);
    if (!page) return;
    setActivePageId(page.id);
    const img = await loadImage(page.processedDataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0);
      setWarpedCanvas(canvas);
      setStep('result');
    }
  };

  // Delete page from tray
  const handleDeletePage = (pageId: string) => {
    setPages((prev) => prev.filter((p) => p.id !== pageId));
  };

  // Load a built-in realistic test sample (so users can test right away on desktop)
  const handleLoadSample = async (sampleType: 'invoice' | 'receipt') => {
    // Generate a high-detail realistic document on canvas
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 1200;
    sampleCanvas.height = 900;
    const ctx = sampleCanvas.getContext('2d');
    if (!ctx) return;

    // Background: dark wood desk
    ctx.fillStyle = '#26211d';
    ctx.fillRect(0, 0, 1200, 900);
    // Desk grain lines
    ctx.strokeStyle = '#322b26';
    ctx.lineWidth = 2;
    for (let y = 0; y < 900; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(400, y + 10, 800, y - 10, 1200, y + 5);
      ctx.stroke();
    }

    // Shadow under tilted document
    ctx.save();
    ctx.translate(600, 450);
    const angle = sampleType === 'invoice' ? -0.08 : 0.06;
    ctx.rotate(angle);

    const docW = sampleType === 'invoice' ? 520 : 360;
    const docH = sampleType === 'invoice' ? 720 : 680;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(-docW / 2 + 15, -docH / 2 + 18, docW, docH);

    // Document paper (off-white crisp sheet)
    ctx.fillStyle = '#f8f8f6';
    ctx.fillRect(-docW / 2, -docH / 2, docW, docH);

    // Document header
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(sampleType === 'invoice' ? 'TAX INVOICE' : 'PURCHASE RECEIPT', -docW / 2 + 35, -docH / 2 + 60);

    ctx.font = '11px monospace';
    ctx.fillStyle = '#64748b';
    ctx.fillText(sampleType === 'invoice' ? 'INV-2026-08492' : 'ORDER #98231', -docW / 2 + 35, -docH / 2 + 82);
    ctx.fillText('DATE: 2026-10-06', -docW / 2 + 35, -docH / 2 + 98);

    // Divider line
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-docW / 2 + 35, -docH / 2 + 115);
    ctx.lineTo(docW / 2 - 35, -docH / 2 + 115);
    ctx.stroke();

    // Table rows
    const items = sampleType === 'invoice'
      ? [
          { desc: 'Optical Engineering Consultation', qty: '12 hrs', total: '$1,800.00' },
          { desc: 'Perspective Correction Pipeline Dev', qty: '1 unit', total: '$2,450.00' },
          { desc: 'Client-side PDF Exporter Module', qty: '1 unit', total: '$950.00' },
          { desc: 'Multi-device Hardware Testing', qty: '4 hrs', total: '$480.00' },
        ]
      : [
          { desc: 'Espresso Roast (500g)', qty: '2', total: '$28.00' },
          { desc: 'Pour-over Paper Filters #4', qty: '1', total: '$8.50' },
          { desc: 'Ceramic Mug 350ml', qty: '1', total: '$16.00' },
        ];

    let startY = -docH / 2 + 150;
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#334155';
    ctx.fillText('DESCRIPTION', -docW / 2 + 35, startY);
    ctx.fillText('AMOUNT', docW / 2 - 90, startY);

    startY += 25;
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#475569';
    items.forEach((item) => {
      ctx.fillText(item.desc, -docW / 2 + 35, startY);
      ctx.fillText(item.total, docW / 2 - 90, startY);
      startY += 30;
    });

    // Total box
    startY += 20;
    ctx.beginPath();
    ctx.moveTo(-docW / 2 + 35, startY);
    ctx.lineTo(docW / 2 - 35, startY);
    ctx.stroke();

    startY += 30;
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.fillText('BALANCE DUE:', -docW / 2 + 35, startY);
    ctx.fillText(sampleType === 'invoice' ? '$5,680.00 USD' : '$52.50 USD', docW / 2 - 130, startY);

    // Stamp / signature at bottom
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(docW / 2 - 140, docH / 2 - 100, 105, 45);
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#2563eb';
    ctx.fillText('VERIFIED', docW / 2 - 118, docH / 2 - 72);

    ctx.restore();

    await processImageForDetection(sampleCanvas);
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

      {/* Multi-page session tray if pages exist */}
      {pages.length > 0 && (
        <MultiPageTray
          pages={pages}
          activePageId={activePageId}
          onSelectPage={handleSelectPage}
          onDeletePage={handleDeletePage}
          onAddNewPage={handleResetForNewScan}
        />
      )}

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

              {/* Sample test documents for instant testing */}
              <div className="border-t border-neutral-850 pt-5">
                <span className="text-xs text-neutral-500">
                  No camera or photo handy? Test with sample documents:
                </span>
                <div className="mt-2.5 flex justify-center gap-2">
                  <button
                    onClick={() => handleLoadSample('invoice')}
                    className="flex items-center gap-1.5 rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-850"
                  >
                    <FileText className="h-3.5 w-3.5 text-blue-400" />
                    <span>Angled Invoice Sample</span>
                  </button>
                  <button
                    onClick={() => handleLoadSample('receipt')}
                    className="flex items-center gap-1.5 rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-850"
                  >
                    <FileText className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Desk Receipt Sample</span>
                  </button>
                </div>
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
            onAddPage={handleAddPage}
            onReset={handleTotalReset}
            allPages={pages}
            currentPageId={activePageId}
          />
        )}
      </main>
    </div>
  );
};
