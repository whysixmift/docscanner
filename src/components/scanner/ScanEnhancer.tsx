'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { EnhancementMode, EnhancementOptions, ScannedPage } from '@/lib/opencv/types';
import { applyEnhancement } from '@/lib/opencv/enhancement';
import { rotateCanvas, downloadDataUrl } from '@/lib/image/utils';
import { exportPagesToPdf } from '@/lib/pdf/exporter';
import {
  Download,
  RotateCw,
  Crop,
  Plus,
  Sliders,
  Check,
  RefreshCw,
  FileDown,
} from 'lucide-react';

interface ScanEnhancerProps {
  warpedCanvas: HTMLCanvasElement;
  onReCrop: () => void;
  onAddPage: (page: ScannedPage) => void;
  onReset: () => void;
  allPages: ScannedPage[];
  currentPageId: string;
}

export const ScanEnhancer: React.FC<ScanEnhancerProps> = ({
  warpedCanvas,
  onReCrop,
  onAddPage,
  onReset,
  allPages,
  currentPageId,
}) => {
  const [currentCanvas, setCurrentCanvas] = useState<HTMLCanvasElement>(warpedCanvas);
  const [mode, setMode] = useState<EnhancementMode>('color');
  const [brightness, setBrightness] = useState<number>(0);
  const [contrast, setContrast] = useState<number>(1.0);
  const [threshold, setThreshold] = useState<number>(12);
  const [sharpness, setSharpness] = useState<number>(1.0);
  const [showSliders, setShowSliders] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processedDataUrl, setProcessedDataUrl] = useState<string>('');
  const [pdfExporting, setPdfExporting] = useState<boolean>(false);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Re-run enhancement whenever mode, canvas, or slider values change
  const runEnhancement = useCallback(async () => {
    setIsProcessing(true);
    try {
      const options: EnhancementOptions = {
        mode,
        brightness,
        contrast,
        threshold,
        sharpness,
      };

      const enhanced = await applyEnhancement(currentCanvas, options);
      if (previewCanvasRef.current) {
        const preview = previewCanvasRef.current;
        preview.width = enhanced.width;
        preview.height = enhanced.height;
        const ctx = preview.getContext('2d');
        if (ctx) {
          ctx.drawImage(enhanced, 0, 0);
        }
      }
      setProcessedDataUrl(enhanced.toDataURL('image/jpeg', 0.95));
    } catch (err) {
      console.error('Enhancement error:', err);
    } finally {
      setIsProcessing(false);
    }
  }, [currentCanvas, mode, brightness, contrast, threshold, sharpness]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void runEnhancement();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [runEnhancement]);

  // Rotate document 90 deg clockwise
  const handleRotate = () => {
    const rotated = rotateCanvas(currentCanvas, 90);
    setCurrentCanvas(rotated);
  };

  // Download single image
  const handleDownloadImage = (format: 'jpeg' | 'png') => {
    if (!processedDataUrl) return;
    const ext = format === 'jpeg' ? 'jpg' : 'png';
    const filename = `scan-${new Date().toISOString().slice(0, 10)}-${Date.now().toString().slice(-4)}.${ext}`;
    
    if (format === 'png' && previewCanvasRef.current) {
      const pngUrl = previewCanvasRef.current.toDataURL('image/png');
      downloadDataUrl(pngUrl, filename);
    } else {
      downloadDataUrl(processedDataUrl, filename);
    }
  };

  // Export PDF (supports all scanned pages in current session)
  const handleExportPdf = async (pageSize: 'a4' | 'fit' = 'a4') => {
    setPdfExporting(true);
    try {
      // Build current page object
      const currentPage: ScannedPage = {
        id: currentPageId,
        originalDataUrl: '',
        corners: [
          { x: 0, y: 0 },
          { x: currentCanvas.width, y: 0 },
          { x: currentCanvas.width, y: currentCanvas.height },
          { x: 0, y: currentCanvas.height },
        ],
        originalWidth: currentCanvas.width,
        originalHeight: currentCanvas.height,
        processedDataUrl,
        mode,
        options: { mode, brightness, contrast, threshold, sharpness },
        createdAt: Date.now(),
      };

      // If other pages exist, include them; otherwise export this page
      const exportList = allPages.length > 0 
        ? allPages.map((p) => (p.id === currentPageId ? currentPage : p))
        : [currentPage];

      await exportPagesToPdf(exportList, {
        pageSize,
        filename: `scanned-document-${new Date().toISOString().slice(0, 10)}.pdf`,
      });
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setPdfExporting(false);
    }
  };

  // Add current scan to session pages
  const handleAddCurrentPageToTray = () => {
    if (!processedDataUrl) return;
    const newPage: ScannedPage = {
      id: currentPageId || `page-${Date.now()}`,
      originalDataUrl: '',
      corners: [
        { x: 0, y: 0 },
        { x: currentCanvas.width, y: 0 },
        { x: currentCanvas.width, y: currentCanvas.height },
        { x: 0, y: currentCanvas.height },
      ],
      originalWidth: currentCanvas.width,
      originalHeight: currentCanvas.height,
      processedDataUrl,
      mode,
      options: { mode, brightness, contrast, threshold, sharpness },
      createdAt: Date.now(),
    };
    onAddPage(newPage);
  };

  const modeButtons: { key: EnhancementMode; label: string; desc: string }[] = [
    { key: 'original', label: 'Original', desc: 'True source colors' },
    { key: 'color', label: 'Color', desc: 'Enhanced contrast & sharpness' },
    { key: 'grayscale', label: 'Grayscale', desc: 'Balanced monochrome' },
    { key: 'bw', label: 'B&W', desc: 'Clean photocopy binarization' },
  ];

  return (
    <div className="flex h-full w-full flex-col bg-neutral-950 text-neutral-200">
      {/* Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-neutral-800 bg-neutral-900/90 px-4 py-2.5">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Document Scan
          </span>
          <span className="rounded bg-neutral-800 px-2 py-0.5 font-mono text-[11px] text-neutral-300">
            {currentCanvas.width} × {currentCanvas.height} px
          </span>
        </div>

        <div className="flex items-center space-x-1.5">
          <button
            onClick={onReCrop}
            title="Adjust corners / Re-crop"
            className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:bg-neutral-700 active:scale-95"
          >
            <Crop className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Adjust Corners</span>
          </button>

          <button
            onClick={handleRotate}
            title="Rotate 90 degrees"
            className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:bg-neutral-700 active:scale-95"
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Rotate</span>
          </button>

          <button
            onClick={() => setShowSliders(!showSliders)}
            title="Fine-tune filters"
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs transition-colors active:scale-95 ${
              showSliders
                ? 'border-blue-500 bg-blue-950/60 text-blue-300'
                : 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Fine Tune</span>
          </button>
        </div>
      </div>

      {/* Main Preview Area */}
      <div className="relative flex flex-1 items-center justify-center overflow-auto p-4 md:p-8">
        <div className="relative max-h-full max-w-full shadow-2xl">
          <canvas
            ref={previewCanvasRef}
            className="max-h-[68vh] max-w-full rounded border border-neutral-800 bg-white object-contain shadow-xl"
          />

          {isProcessing && (
            <div className="absolute inset-0 flex items-center justify-center rounded bg-black/30 backdrop-blur-xs">
              <RefreshCw className="h-6 w-6 animate-spin text-white" />
            </div>
          )}
        </div>
      </div>

      {/* Optional Fine-Tune Drawer */}
      {showSliders && (
        <div className="border-t border-neutral-800 bg-neutral-900/95 px-6 py-3 backdrop-blur-md">
          <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3 text-xs">
            {/* Brightness */}
            <div>
              <div className="mb-1 flex justify-between text-neutral-400">
                <span>Brightness</span>
                <span className="font-mono">{brightness}</span>
              </div>
              <input
                type="range"
                min="-40"
                max="40"
                value={brightness}
                onChange={(e) => setBrightness(parseInt(e.target.value, 10))}
                className="w-full accent-blue-500"
              />
            </div>

            {/* Contrast */}
            <div>
              <div className="mb-1 flex justify-between text-neutral-400">
                <span>Contrast</span>
                <span className="font-mono">{contrast.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.6"
                max="1.8"
                step="0.05"
                value={contrast}
                onChange={(e) => setContrast(parseFloat(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>

            {/* Threshold or Sharpness */}
            {mode === 'bw' ? (
              <div>
                <div className="mb-1 flex justify-between text-neutral-400">
                  <span>B&W Sensitivity</span>
                  <span className="font-mono">{threshold}</span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="35"
                  value={threshold}
                  onChange={(e) => setThreshold(parseInt(e.target.value, 10))}
                  className="w-full accent-blue-500"
                />
              </div>
            ) : (
              <div>
                <div className="mb-1 flex justify-between text-neutral-400">
                  <span>Sharpness</span>
                  <span className="font-mono">{sharpness.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2.0"
                  step="0.2"
                  value={sharpness}
                  onChange={(e) => setSharpness(parseFloat(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Mode Switcher and Export Bar */}
      <div className="border-t border-neutral-800 bg-neutral-900 px-4 py-3">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* Enhancement Mode Buttons */}
          <div className="flex items-center gap-1.5 self-center sm:self-auto">
            {modeButtons.map((btn) => {
              const active = mode === btn.key;
              return (
                <button
                  key={btn.key}
                  onClick={() => setMode(btn.key)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                    active
                      ? 'border border-blue-500/50 bg-blue-600 text-white shadow-sm'
                      : 'border border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-750 hover:text-white'
                  }`}
                >
                  {active && <Check className="h-3 w-3" />}
                  <span>{btn.label}</span>
                </button>
              );
            })}
          </div>

          {/* Action Export Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={handleAddCurrentPageToTray}
              title="Add page to multi-page document"
              className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 transition-colors hover:bg-neutral-750 active:scale-95"
            >
              <Plus className="h-3.5 w-3.5 text-emerald-400" />
              <span>Add Page</span>
            </button>

            <button
              onClick={() => handleDownloadImage('jpeg')}
              className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 transition-colors hover:bg-neutral-750 active:scale-95"
            >
              <Download className="h-3.5 w-3.5" />
              <span>JPG</span>
            </button>

            <button
              onClick={() => handleDownloadImage('png')}
              className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 transition-colors hover:bg-neutral-750 active:scale-95"
            >
              <Download className="h-3.5 w-3.5" />
              <span>PNG</span>
            </button>

            <button
              onClick={() => handleExportPdf('a4')}
              disabled={pdfExporting}
              className="flex items-center gap-1.5 rounded bg-blue-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-500 active:scale-95 disabled:opacity-50"
            >
              {pdfExporting ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileDown className="h-3.5 w-3.5" />
              )}
              <span>
                Export PDF {allPages.length > 0 ? `(${allPages.length + 1} pgs)` : ''}
              </span>
            </button>

            <button
              onClick={onReset}
              className="text-xs text-neutral-400 underline-offset-4 hover:text-neutral-200 hover:underline px-2"
            >
              Scan New
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
