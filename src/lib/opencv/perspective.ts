/* eslint-disable @typescript-eslint/no-explicit-any */

import { Point, QuadCorners } from './types';
import { loadOpenCV } from './loader';

/**
 * Calculate Euclidean distance between two points
 */
export function distance(p1: Point, p2: Point): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/**
 * Calculate the true un-distorted rectangular dimensions from quadrilateral corners
 */
export function calculateOutputDimensions(corners: QuadCorners): { width: number; height: number } {
  const [tl, tr, br, bl] = corners;

  const widthTop = distance(tl, tr);
  const widthBottom = distance(bl, br);
  const maxWidth = Math.max(widthTop, widthBottom);

  const heightLeft = distance(tl, bl);
  const heightRight = distance(tr, br);
  const maxHeight = Math.max(heightLeft, heightRight);

  // Enforce reasonable bounds
  const width = Math.max(100, Math.round(maxWidth));
  const height = Math.max(100, Math.round(maxHeight));

  return { width, height };
}

/**
 * Apply perspective correction to an image given 4 corners
 * Returns an HTMLCanvasElement containing the warped document
 */
export async function warpPerspectiveDoc(
  source: HTMLImageElement | HTMLCanvasElement,
  corners: QuadCorners
): Promise<HTMLCanvasElement> {
  const cv = await loadOpenCV();
  if (!cv) {
    throw new Error('OpenCV is not initialized');
  }

  const { width: outWidth, height: outHeight } = calculateOutputDimensions(corners);

  // Prepare full-size source canvas to read pixels via OpenCV
  const srcWidth = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const srcHeight = source instanceof HTMLImageElement ? source.naturalHeight : source.height;

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = srcWidth;
  srcCanvas.height = srcHeight;
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) {
    throw new Error('Failed to get 2D context for perspective warping');
  }
  srcCtx.drawImage(source, 0, 0, srcWidth, srcHeight);

  const matsToClean: any[] = [];
  const track = (mat: any) => {
    if (mat) matsToClean.push(mat);
    return mat;
  };

  try {
    const srcMat = track(cv.imread(srcCanvas));

    const [tl, tr, br, bl] = corners;

    // Source quad coordinates (Float32)
    const srcCoords = track(
      cv.matFromArray(4, 1, cv.CV_32FC2, [
        tl.x, tl.y,
        tr.x, tr.y,
        br.x, br.y,
        bl.x, bl.y,
      ])
    );

    // Destination rectangular coordinates (Float32)
    const dstCoords = track(
      cv.matFromArray(4, 1, cv.CV_32FC2, [
        0, 0,
        outWidth, 0,
        outWidth, outHeight,
        0, outHeight,
      ])
    );

    // Compute perspective transformation matrix
    const M = track(cv.getPerspectiveTransform(srcCoords, dstCoords));

    // Warp perspective
    const warpedMat = track(new cv.Mat());
    const dsize = new cv.Size(outWidth, outHeight);
    
    // Fill background with white border if slightly out of frame
    const whiteBorder = new cv.Scalar(255, 255, 255, 255);
    cv.warpPerspective(srcMat, warpedMat, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, whiteBorder);

    // Output to result canvas
    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = outWidth;
    resultCanvas.height = outHeight;
    cv.imshow(resultCanvas, warpedMat);

    return resultCanvas;
  } finally {
    for (const mat of matsToClean) {
      try {
        if (mat && typeof mat.delete === 'function') {
          mat.delete();
        }
      } catch {
        // Ignore cleanup error
      }
    }
  }
}
