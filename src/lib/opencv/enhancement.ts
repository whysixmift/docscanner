/* eslint-disable @typescript-eslint/no-explicit-any */

import { EnhancementOptions } from './types';
import { loadOpenCV } from './loader';

/**
 * Apply scan-like enhancement filters to a perspective-warped document canvas.
 * Implements high-quality photocopy binarization, Lab color background whitening,
 * and contrast-enhanced grayscale.
 */
export async function applyEnhancement(
  sourceCanvas: HTMLCanvasElement,
  options: EnhancementOptions
): Promise<HTMLCanvasElement> {
  const cv = await loadOpenCV();
  if (!cv) {
    throw new Error('OpenCV is not initialized');
  }

  const {
    mode,
    brightness = 0,
    contrast = 1.0,
    threshold = 12,
    sharpness = 1.0,
  } = options;

  // If original mode and untouched sliders, return a fast direct copy
  if (mode === 'original' && brightness === 0 && contrast === 1.0 && sharpness === 0) {
    const copyCanvas = document.createElement('canvas');
    copyCanvas.width = sourceCanvas.width;
    copyCanvas.height = sourceCanvas.height;
    const ctx = copyCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(sourceCanvas, 0, 0);
    }
    return copyCanvas;
  }

  const matsToClean: any[] = [];
  const track = (mat: any) => {
    if (mat) matsToClean.push(mat);
    return mat;
  };

  try {
    const srcMat = track(cv.imread(sourceCanvas));
    const resultMat = track(new cv.Mat());

    if (mode === 'original') {
      // Direct color adjustment with user-defined contrast and brightness
      srcMat.convertTo(resultMat, -1, contrast, brightness);

    } else if (mode === 'color') {
      // Enhanced Color Document Mode:
      // Uses Lab color space to whiten the paper background while preserving color ink & stamps.
      const bgr = track(new cv.Mat());
      cv.cvtColor(srcMat, bgr, cv.COLOR_RGBA2BGR);

      const lab = track(new cv.Mat());
      cv.cvtColor(bgr, lab, cv.COLOR_BGR2Lab);

      const channels = track(new cv.MatVector());
      cv.split(lab, channels);
      const L = channels.get(0);

      // CLAHE on Lightness channel to normalize non-uniform paper lighting
      const clahe = track(new cv.CLAHE(2.0, new cv.Size(8, 8)));
      const enhancedL = track(new cv.Mat());
      clahe.apply(L, enhancedL);

      // Contrast stretch and white-point boost
      const effectiveContrast = contrast * 1.15;
      const effectiveBrightness = brightness + 10;
      const stretchedL = track(new cv.Mat());
      enhancedL.convertTo(stretchedL, -1, effectiveContrast, effectiveBrightness);

      channels.set(0, stretchedL);
      cv.merge(channels, lab);

      const enhancedBgr = track(new cv.Mat());
      cv.cvtColor(lab, enhancedBgr, cv.COLOR_Lab2BGR);

      // Laplacian sharpening for razor-sharp text and print dots
      if (sharpness > 0) {
        const kCenter = 4 * (sharpness * 0.4) + 1;
        const kSide = -(sharpness * 0.4);
        const kernel = track(
          cv.matFromArray(3, 3, cv.CV_32F, [
            0, kSide, 0,
            kSide, kCenter, kSide,
            0, kSide, 0,
          ])
        );
        const sharpenedBgr = track(new cv.Mat());
        cv.filter2D(enhancedBgr, sharpenedBgr, cv.CV_8U, kernel);
        cv.cvtColor(sharpenedBgr, resultMat, cv.COLOR_BGR2RGBA);
      } else {
        cv.cvtColor(enhancedBgr, resultMat, cv.COLOR_BGR2RGBA);
      }

    } else if (mode === 'grayscale') {
      // High-contrast Grayscale Document Mode:
      const gray = track(new cv.Mat());
      cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);

      // CLAHE for balanced tone distribution across shadows
      const clahe = track(new cv.CLAHE(2.0, new cv.Size(8, 8)));
      const equalized = track(new cv.Mat());
      clahe.apply(gray, equalized);

      const enhancedGray = track(new cv.Mat());
      const effectiveContrast = contrast * 1.2;
      const effectiveBrightness = brightness + 12;
      equalized.convertTo(enhancedGray, -1, effectiveContrast, effectiveBrightness);

      cv.cvtColor(enhancedGray, resultMat, cv.COLOR_GRAY2RGBA);

    } else if (mode === 'bw') {
      // Document / B&W (Photocopy / Clean Scan):
      // Adaptive thresholding with dimension-proportional window to eliminate hollow letter artifacts
      const gray = track(new cv.Mat());
      cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);

      // Gentle blur before thresholding
      const blurred = track(new cv.Mat());
      cv.GaussianBlur(gray, blurred, new cv.Size(3, 3), 0);

      // Window size is scaled proportionally to image size (must be odd integer >= 35)
      const maxDim = Math.max(sourceCanvas.width, sourceCanvas.height);
      let blockSize = Math.max(35, Math.min(81, Math.round(maxDim * 0.04)));
      if (blockSize % 2 === 0) blockSize += 1;

      const cOffset = Math.max(2, Math.min(35, Math.round(threshold)));

      const binarized = track(new cv.Mat());
      cv.adaptiveThreshold(
        blurred,
        binarized,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY,
        blockSize,
        cOffset
      );

      cv.cvtColor(binarized, resultMat, cv.COLOR_GRAY2RGBA);
    }

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = sourceCanvas.width;
    outputCanvas.height = sourceCanvas.height;
    cv.imshow(outputCanvas, resultMat);

    return outputCanvas;
  } finally {
    for (const mat of matsToClean) {
      try {
        if (mat && typeof mat.delete === 'function') {
          mat.delete();
        }
      } catch {
        // Ignore deletion cleanup error
      }
    }
  }
}
