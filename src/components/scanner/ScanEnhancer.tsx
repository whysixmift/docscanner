'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { EnhancementMode, EnhancementOptions } from '@/lib/opencv/types';
import { applyEnhancement } from '@/lib/opencv/enhancement';
import { rotateCanvas, downloadDataUrl } from '@/lib/image/utils';
import {
  Download,
  RotateCw,
  Crop,
  Sliders,
  Check,
  RefreshCw,
} from 'lucide-react';

interface ScanEnhancerProps {
  warpedCanvas: HTMLCanvasElement;
  onReCrop: () => void;
  onReset: () => void;
}

export const ScanEnhancer: React.FC<ScanEnhancerProps> = ({
  warpedCanvas,
  onReCrop,
  onReset,
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

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Terapkan filter visual dokumen (Color Enhance, B&W, Grayscale, dsb.)
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
    }, 40);
    return () => window.clearTimeout(timeoutId);
  }, [runEnhancement]);

  // Rotasi dokumen hasil straightening 90 derajat searah jarum jam
  const handleRotate = () => {
    const rotated = rotateCanvas(currentCanvas, 90);
    setCurrentCanvas(rotated);
  };

  // Download hasil scan (JPG atau PNG)
  const handleDownloadImage = (format: 'jpeg' | 'png') => {
    if (!processedDataUrl) return;
    const filename = `scanned-document-${Date.now()}.${format === 'png' ? 'png' : 'jpg'}`;
    
    if (format === 'png' && previewCanvasRef.current) {
      const pngUrl = previewCanvasRef.current.toDataURL('image/png');
      downloadDataUrl(pngUrl, filename);
    } else {
      downloadDataUrl(processedDataUrl, filename);
    }
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
        <div className="flex items-center gap-2">
          <button
            onClick={onReCrop}
            className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-750 hover:text-white"
          >
            <Crop className="h-3.5 w-3.5" />
            <span>Re-Crop</span>
          </button>

          <button
            onClick={handleRotate}
            className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-750 hover:text-white"
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span>Rotate 90°</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSliders(!showSliders)}
            className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs transition-colors ${
              showSliders
                ? 'border-blue-500 bg-blue-950/40 text-blue-300'
                : 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-750'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>Tune</span>
          </button>
        </div>
      </div>

      {/* Main Document Preview Viewport */}
      <div className="relative flex flex-1 items-center justify-center overflow-auto p-4 sm:p-6">
        <div className="relative flex max-h-full max-w-full items-center justify-center shadow-2xl">
          <canvas
            ref={previewCanvasRef}
            className="max-h-[72vh] max-w-full rounded border border-neutral-800 bg-neutral-900 object-contain shadow-lg"
          />

          {isProcessing && (
            <div className="absolute inset-0 flex items-center justify-center rounded bg-black/40 backdrop-blur-xs">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
            </div>
          )}
        </div>
      </div>

      {/* Slider Drawer (Collapsible) */}
      {showSliders && (
        <div className="border-t border-neutral-800 bg-neutral-900/95 px-6 py-3 text-xs">
          <div className="mx-auto grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="mb-1 flex justify-between text-neutral-400">
                <span>Brightness</span>
                <span className="font-mono">{brightness > 0 ? `+${brightness}` : brightness}</span>
              </div>
              <input
                type="range"
                min="-60"
                max="60"
                value={brightness}
                onChange={(e) => setBrightness(parseInt(e.target.value, 10))}
                className="w-full accent-blue-500"
              />
            </div>

            <div>
              <div className="mb-1 flex justify-between text-neutral-400">
                <span>Contrast</span>
                <span className="font-mono">{contrast.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.5"
                step="0.1"
                value={contrast}
                onChange={(e) => setContrast(parseFloat(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>

            {mode === 'bw' && (
              <div>
                <div className="mb-1 flex justify-between text-neutral-400">
                  <span>Threshold</span>
                  <span className="font-mono">{threshold}</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="45"
                  value={threshold}
                  onChange={(e) => setThreshold(parseInt(e.target.value, 10))}
                  className="w-full accent-blue-500"
                />
              </div>
            )}

            {mode !== 'bw' && (
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
              onClick={() => handleDownloadImage('jpeg')}
              className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-3.5 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:bg-neutral-750 active:scale-95"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download JPG</span>
            </button>

            <button
              onClick={() => handleDownloadImage('png')}
              className="flex items-center gap-1.5 rounded bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-500 active:scale-95"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download PNG</span>
            </button>

            <button
              onClick={onReset}
              className="px-2 text-xs text-neutral-400 underline-offset-4 hover:text-neutral-200 hover:underline"
            >
              Scan New
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
