'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Point, QuadCorners } from '@/lib/opencv/types';
import { LoupeMagnifier } from './LoupeMagnifier';
import { RotateCw, Maximize2, Sparkles, Check, RefreshCw } from 'lucide-react';

interface DocumentCornerEditorProps {
  imageElement: HTMLImageElement | HTMLCanvasElement;
  corners: QuadCorners;
  onChangeCorners: (corners: QuadCorners) => void;
  onConfirm: () => void;
  onAutoDetect: () => void;
  onRotateSource: () => void;
  isDetecting?: boolean;
  detectionMessage?: string | null;
}

export const DocumentCornerEditor: React.FC<DocumentCornerEditorProps> = ({
  imageElement,
  corners,
  onChangeCorners,
  onConfirm,
  onAutoDetect,
  onRotateSource,
  isDetecting = false,
  detectionMessage = null,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [activeCornerIdx, setActiveCornerIdx] = useState<number | null>(null);
  const [loupeClientPos, setLoupeClientPos] = useState<Point>({ x: 0, y: 0 });
  const [displayMetrics, setDisplayMetrics] = useState<{
    width: number;
    height: number;
    scaleX: number;
    scaleY: number;
  }>({
    width: 0,
    height: 0,
    scaleX: 1,
    scaleY: 1,
  });

  const naturalWidth = imageElement instanceof HTMLImageElement ? imageElement.naturalWidth : imageElement.width;
  const naturalHeight = imageElement instanceof HTMLImageElement ? imageElement.naturalHeight : imageElement.height;

  // Measure and draw image to responsive canvas
  const updateMetricsAndCanvas = useCallback(() => {
    if (!containerRef.current || !displayCanvasRef.current || naturalWidth === 0 || naturalHeight === 0) return;

    const container = containerRef.current;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;

    // Maintain aspect ratio within container with safety padding
    const imageAspect = naturalWidth / naturalHeight;
    const containerAspect = containerW / containerH;

    let dispW = containerW;
    let dispH = containerH;

    if (containerAspect > imageAspect) {
      dispH = containerH;
      dispW = dispH * imageAspect;
    } else {
      dispW = containerW;
      dispH = dispW / imageAspect;
    }

    const scaleX = dispW / naturalWidth;
    const scaleY = dispH / naturalHeight;

    setDisplayMetrics({
      width: dispW,
      height: dispH,
      scaleX,
      scaleY,
    });

    const canvas = displayCanvasRef.current;
    canvas.width = dispW;
    canvas.height = dispH;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(imageElement, 0, 0, dispW, dispH);
    }
  }, [imageElement, naturalWidth, naturalHeight]);

  useEffect(() => {
    updateMetricsAndCanvas();
    const handleResize = () => updateMetricsAndCanvas();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateMetricsAndCanvas]);

  // Convert natural point to display point
  const naturalToDisplay = useCallback(
    (p: Point): Point => {
      return {
        x: p.x * displayMetrics.scaleX,
        y: p.y * displayMetrics.scaleY,
      };
    },
    [displayMetrics]
  );

  // Convert display point to natural point
  const displayToNatural = useCallback(
    (p: Point): Point => {
      return {
        x: Math.min(naturalWidth, Math.max(0, p.x / displayMetrics.scaleX)),
        y: Math.min(naturalHeight, Math.max(0, p.y / displayMetrics.scaleY)),
      };
    },
    [displayMetrics, naturalWidth, naturalHeight]
  );

  // Handle interaksi drag 4 titik sudut & kaca pembesar (loupe zoom)
  const handlePointerDown = (idx: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setActiveCornerIdx(idx);
    setLoupeClientPos({ x: e.clientX, y: e.clientY });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activeCornerIdx === null || !containerRef.current || !displayCanvasRef.current) return;
    e.preventDefault();

    const canvasRect = displayCanvasRef.current.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;

    setLoupeClientPos({ x: clientX, y: clientY });

    // Konversi koordinat layar (display) ke koordinat asli foto (natural resolution)
    const dispX = clientX - canvasRect.left;
    const dispY = clientY - canvasRect.top;

    const naturalPt = displayToNatural({ x: dispX, y: dispY });

    const newCorners: QuadCorners = [...corners] as QuadCorners;
    newCorners[activeCornerIdx] = naturalPt;
    onChangeCorners(newCorners);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeCornerIdx !== null) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Ignore pointer capture release error
      }
      setActiveCornerIdx(null);
    }
  };

  // Full image reset
  const handleSetFullImage = () => {
    onChangeCorners([
      { x: 0, y: 0 },
      { x: naturalWidth, y: 0 },
      { x: naturalWidth, y: naturalHeight },
      { x: 0, y: naturalHeight },
    ]);
  };

  const cornerLabels = ['TL', 'TR', 'BR', 'BL'];
  const dispCorners = corners.map(naturalToDisplay);

  return (
    <div className="relative flex h-full w-full flex-col select-none bg-neutral-950 text-neutral-200">
      {/* Top Banner / Message */}
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900/90 px-4 py-2.5 text-xs">
        <div className="flex items-center space-x-2">
          <span className="font-medium text-neutral-200">Adjust Document Boundary</span>
          {detectionMessage && (
            <span className="hidden rounded bg-amber-950/60 px-2 py-0.5 text-amber-300 md:inline">
              {detectionMessage}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={onRotateSource}
            title="Rotate 90 degrees clockwise"
            className="flex items-center gap-1 rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:bg-neutral-700 active:scale-95"
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Rotate</span>
          </button>
          <button
            onClick={handleSetFullImage}
            title="Expand corners to full image"
            className="flex items-center gap-1 rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:bg-neutral-700 active:scale-95"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Full Frame</span>
          </button>
          <button
            onClick={onAutoDetect}
            disabled={isDetecting}
            title="Re-run automatic corner detection"
            className="flex items-center gap-1 rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:bg-neutral-700 active:scale-95 disabled:opacity-50"
          >
            {isDetecting ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-blue-400" />
            )}
            <span className="hidden sm:inline">Auto Detect</span>
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      <div
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative flex flex-1 items-center justify-center overflow-hidden p-2 md:p-6"
        style={{ touchAction: 'none' }}
      >
        <div
          className="relative shadow-2xl"
          style={{
            width: `${displayMetrics.width}px`,
            height: `${displayMetrics.height}px`,
          }}
        >
          {/* Base Image Canvas */}
          <canvas
            ref={displayCanvasRef}
            className="block h-full w-full rounded-sm"
          />

          {/* SVG Overlay for Polygons and Guides */}
          {displayMetrics.width > 0 && (
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
              viewBox={`0 0 ${displayMetrics.width} ${displayMetrics.height}`}
            >
              {/* Shaded Area outside polygon or tinted document interior */}
              <polygon
                points={dispCorners.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="rgba(59, 130, 246, 0.12)"
                stroke="#3b82f6"
                strokeWidth="2"
                strokeDasharray="none"
              />

              {/* Edge guide lines */}
              {dispCorners.map((p, i) => {
                const next = dispCorners[(i + 1) % 4];
                return (
                  <line
                    key={`edge-${i}`}
                    x1={p.x}
                    y1={p.y}
                    x2={next.x}
                    y2={next.y}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    opacity="0.8"
                  />
                );
              })}
            </svg>
          )}

          {/* Draggable Corner Handles */}
          {displayMetrics.width > 0 &&
            dispCorners.map((p, idx) => {
              const isActive = activeCornerIdx === idx;
              return (
                <div
                  key={`corner-handle-${idx}`}
                  onPointerDown={(e) => handlePointerDown(idx, e)}
                  style={{
                    left: `${p.x}px`,
                    top: `${p.y}px`,
                    transform: 'translate(-50%, -50%)',
                    touchAction: 'none',
                  }}
                  className={`group absolute z-30 flex h-11 w-11 cursor-grab items-center justify-center active:cursor-grabbing ${
                    isActive ? 'scale-110' : ''
                  }`}
                >
                  {/* Subtle target ring */}
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-transform ${
                      isActive
                        ? 'border-white bg-blue-600 shadow-[0_0_12px_rgba(59,130,246,0.8)]'
                        : 'border-white/90 bg-blue-500 shadow-md group-hover:scale-110'
                    }`}
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                  </div>

                  {/* Corner indicator label */}
                  <span
                    className={`pointer-events-none absolute -top-5 rounded bg-neutral-900/80 px-1 py-0.2 font-mono text-[9px] text-neutral-300 backdrop-blur-xs transition-opacity ${
                      isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {cornerLabels[idx]}
                  </span>
                </div>
              );
            })}
        </div>

        {/* Loupe Magnifier for precision placement */}
        <LoupeMagnifier
          visible={activeCornerIdx !== null}
          sourceImage={imageElement}
          cornerPos={activeCornerIdx !== null ? corners[activeCornerIdx] : { x: 0, y: 0 }}
          containerPos={loupeClientPos}
          size={140}
          zoom={2.6}
        />
      </div>

      {/* Bottom Action Footer */}
      <div className="flex items-center justify-between border-t border-neutral-800 bg-neutral-900 px-4 py-3">
        <div className="text-xs text-neutral-400">
          <span className="hidden sm:inline">Drag the 4 corner handles to align with the paper edges.</span>
          <span className="sm:hidden">Drag corners to match paper.</span>
        </div>
        <button
          onClick={onConfirm}
          className="flex items-center gap-1.5 rounded bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-500 active:scale-95"
        >
          <Check className="h-4 w-4" />
          <span>Apply & Straighten</span>
        </button>
      </div>
    </div>
  );
};
