'use client';

import React, { useEffect, useRef } from 'react';
import { Point } from '@/lib/opencv/types';

interface LoupeMagnifierProps {
  sourceImage: HTMLImageElement | HTMLCanvasElement | null;
  cornerPos: Point; // in natural image coordinates
  containerPos: Point; // in client viewport coordinates (where to position loupe)
  zoom?: number;
  size?: number;
  visible: boolean;
}

export const LoupeMagnifier: React.FC<LoupeMagnifierProps> = ({
  sourceImage,
  cornerPos,
  containerPos,
  zoom = 2.5,
  size = 130,
  visible,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!visible || !sourceImage || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const halfSize = size / 2;
    ctx.clearRect(0, 0, size, size);

    // Save state for circular clipping
    ctx.save();
    ctx.beginPath();
    ctx.arc(halfSize, halfSize, halfSize - 2, 0, Math.PI * 2);
    ctx.clip();

    // Fill background
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, size, size);

    // Draw zoomed portion of source image centered at cornerPos
    const srcW = size / zoom;
    const srcH = size / zoom;
    const srcX = cornerPos.x - srcW / 2;
    const srcY = cornerPos.y - srcH / 2;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      sourceImage,
      srcX,
      srcY,
      srcW,
      srcH,
      0,
      0,
      size,
      size
    );

    // Draw high-contrast crosshair at center
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    // Horizontal crosshair
    ctx.moveTo(halfSize - 16, halfSize);
    ctx.lineTo(halfSize - 4, halfSize);
    ctx.moveTo(halfSize + 4, halfSize);
    ctx.lineTo(halfSize + 16, halfSize);
    // Vertical crosshair
    ctx.moveTo(halfSize, halfSize - 16);
    ctx.lineTo(halfSize, halfSize - 4);
    ctx.moveTo(halfSize, halfSize + 4);
    ctx.lineTo(halfSize, halfSize + 16);
    ctx.stroke();

    // Center tiny reticle dot
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(halfSize, halfSize, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Outer border ring
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#2563eb';
    ctx.beginPath();
    ctx.arc(halfSize, halfSize, halfSize - 2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(halfSize, halfSize, halfSize - 4, 0, Math.PI * 2);
    ctx.stroke();
  }, [sourceImage, cornerPos, zoom, size, visible]);

  if (!visible) return null;

  // Position loupe offset above the finger/cursor so it's not obscured
  const left = Math.max(16, containerPos.x - size / 2);
  const top = Math.max(16, containerPos.y - size - 40);

  return (
    <div
      className="pointer-events-none fixed z-50 rounded-full shadow-2xl transition-opacity duration-75"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="rounded-full shadow-lg"
      />
      <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-neutral-900/90 px-1.5 py-0.5 font-mono text-[10px] text-neutral-300 backdrop-blur-xs">
        {Math.round(cornerPos.x)}, {Math.round(cornerPos.y)}
      </div>
    </div>
  );
};
