export interface Point {
  x: number;
  y: number;
}

/**
 * Ordered corners:
 * [0] Top-Left
 * [1] Top-Right
 * [2] Bottom-Right
 * [3] Bottom-Left
 */
export type QuadCorners = [Point, Point, Point, Point];

export interface DetectionResult {
  corners: QuadCorners;
  confidence: number; // 0 to 1
  found: boolean;
  message?: string;
  sourceWidth: number;
  sourceHeight: number;
}

export type EnhancementMode = 'original' | 'color' | 'grayscale' | 'bw';

export interface EnhancementOptions {
  mode: EnhancementMode;
  brightness?: number; // -50 to +50, default 0
  contrast?: number;   // 0.5 to 2.0, default 1.0
  threshold?: number;  // 5 to 50 for adaptive C offset, default 12
  sharpness?: number;  // 0 to 2.0, default 1.0
}

export interface ScannedPage {
  id: string;
  originalDataUrl: string;
  corners: QuadCorners;
  originalWidth: number;
  originalHeight: number;
  processedDataUrl: string;
  mode: EnhancementMode;
  options: EnhancementOptions;
  createdAt: number;
}
