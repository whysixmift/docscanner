/* eslint-disable @typescript-eslint/no-explicit-any */

import { DetectionResult, Point, QuadCorners } from './types';
import { loadOpenCV } from './loader';

// Hitung luas poligon menggunakan rumus Shoelace (Gauss formula)
function shoelaceArea(pts: Point[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

// Cari 4 sudut segiempat dengan luas terbesar dari convex hull
function findMaxAreaQuad(hullPts: Point[]): Point[] | null {
  const n = hullPts.length;
  if (n === 4) return hullPts;
  if (n < 4) return null;

  // Batasi maksimal 14 titik dominan untuk menjaga performa
  let pts = hullPts;
  if (n > 14) {
    const step = n / 14;
    pts = [];
    for (let i = 0; i < 14; i++) {
      pts.push(hullPts[Math.floor(i * step)]);
    }
  }

  const len = pts.length;
  let maxArea = 0;
  let bestQuad: Point[] | null = null;

  for (let i = 0; i < len - 3; i++) {
    for (let j = i + 1; j < len - 2; j++) {
      for (let k = j + 1; k < len - 1; k++) {
        for (let l = k + 1; l < len; l++) {
          const quad = [pts[i], pts[j], pts[k], pts[l]];
          const area = shoelaceArea(quad);
          if (area > maxArea) {
            maxArea = area;
            bestQuad = quad;
          }
        }
      }
    }
  }

  return bestQuad;
}

// Urutkan 4 titik sudut searah jarum jam: [Top-Left, Top-Right, Bottom-Right, Bottom-Left]
export function orderCorners(pts: Point[]): QuadCorners {
  if (pts.length !== 4) {
    throw new Error('Expected 4 points for ordering');
  }

  // 1. Calculate centroid
  const cx = pts.reduce((sum, p) => sum + p.x, 0) / 4;
  const cy = pts.reduce((sum, p) => sum + p.y, 0) / 4;

  // 2. Sort points in clockwise order around centroid
  // Screen coords: (X right, Y down).
  const clockwise = [...pts].sort((a, b) => {
    const angleA = Math.atan2(a.y - cy, a.x - cx);
    const angleB = Math.atan2(b.y - cy, b.x - cx);
    return angleA - angleB;
  });

  // 3. Find the Top-Left corner: the point that minimizes distance from (0,0) or (x + y)
  let tlIdx = 0;
  let minScore = Infinity;
  for (let i = 0; i < clockwise.length; i++) {
    const distSq = clockwise[i].x * clockwise[i].x + clockwise[i].y * clockwise[i].y;
    if (distSq < minScore) {
      minScore = distSq;
      tlIdx = i;
    }
  }

  // Rotate array starting from Top-Left: [TL, TR, BR, BL]
  return [
    clockwise[tlIdx],
    clockwise[(tlIdx + 1) % 4],
    clockwise[(tlIdx + 2) % 4],
    clockwise[(tlIdx + 3) % 4],
  ];
}

/**
 * Check if 4 corners form a valid non-collapsed quadrilateral
 */
function isValidQuad(corners: Point[]): boolean {
  if (corners.length !== 4) return false;

  // Minimum distance between adjacent corners
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    const dx = corners[next].x - corners[i].x;
    const dy = corners[next].y - corners[i].y;
    const dist = Math.hypot(dx, dy);
    if (dist < 20) return false;
  }

  // Check angle sanity between segments
  for (let i = 0; i < 4; i++) {
    const prev = (i + 3) % 4;
    const next = (i + 1) % 4;
    const v1x = corners[prev].x - corners[i].x;
    const v1y = corners[prev].y - corners[i].y;
    const v2x = corners[next].x - corners[i].x;
    const v2y = corners[next].y - corners[i].y;

    const mag1 = Math.hypot(v1x, v1y);
    const mag2 = Math.hypot(v2x, v2y);
    if (mag1 === 0 || mag2 === 0) return false;

    const cosTheta = (v1x * v2x + v1y * v2y) / (mag1 * mag2);
    // Angle must be between ~30 and 150 degrees
    if (Math.abs(cosTheta) > 0.88) return false;
  }

  // Check opposite sides ratio (perspective foreshortening sanity)
  const top = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
  const bottom = Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y);
  const left = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
  const right = Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y);

  const ratioW = Math.max(top, bottom) / Math.max(1, Math.min(top, bottom));
  const ratioH = Math.max(left, right) / Math.max(1, Math.min(left, right));

  if (ratioW > 3.0 || ratioH > 3.0) return false;

  return true;
}

/**
 * Create default fallback corners with safe margin
 */
export function getDefaultCorners(width: number, height: number, marginPercent: number = 0.08): QuadCorners {
  const mx = width * marginPercent;
  const my = height * marginPercent;
  return [
    { x: Math.round(mx), y: Math.round(my) },
    { x: Math.round(width - mx), y: Math.round(my) },
    { x: Math.round(width - mx), y: Math.round(height - my) },
    { x: Math.round(mx), y: Math.round(height - my) },
  ];
}

/**
 * Detect document boundaries in an image or canvas element using OpenCV.js.
 * Implements a robust multi-strategy pipeline for rotated documents, shadows,
 * lighting gradients, and low contrast backgrounds.
 */
export async function detectDocument(
  source: HTMLImageElement | HTMLCanvasElement
): Promise<DetectionResult> {
  const cv = await loadOpenCV();
  if (!cv) {
    throw new Error('OpenCV is not initialized');
  }

  const srcWidth = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const srcHeight = source instanceof HTMLImageElement ? source.naturalHeight : source.height;

  if (srcWidth <= 0 || srcHeight <= 0) {
    throw new Error('Invalid image dimensions');
  }

  // Downscale sementara jika gambar terlalu besar agar deteksi cepat
  const MAX_PROCESSING_DIM = 900;
  let processWidth = srcWidth;
  let processHeight = srcHeight;
  let scale = 1.0;

  if (Math.max(srcWidth, srcHeight) > MAX_PROCESSING_DIM) {
    scale = MAX_PROCESSING_DIM / Math.max(srcWidth, srcHeight);
    processWidth = Math.round(srcWidth * scale);
    processHeight = Math.round(srcHeight * scale);
  }

  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = processWidth;
  offscreenCanvas.height = processHeight;
  const ctx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return {
      corners: getDefaultCorners(srcWidth, srcHeight),
      confidence: 0,
      found: false,
      message: 'Failed to create 2D canvas context',
      sourceWidth: srcWidth,
      sourceHeight: srcHeight,
    };
  }

  ctx.drawImage(source, 0, 0, processWidth, processHeight);

  const matsToClean: any[] = [];
  const track = (mat: any) => {
    if (mat) matsToClean.push(mat);
    return mat;
  };

  try {
    const srcMat = track(cv.imread(offscreenCanvas));

    // Konversi ke grayscale
    const gray = track(new cv.Mat());
    cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);

    // Reduksi noise dengan Gaussian blur
    const blurred = track(new cv.Mat());
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    // Normalisasi kontras (CLAHE)
    const clahe = track(new cv.CLAHE(3.0, new cv.Size(8, 8)));
    const equalized = track(new cv.Mat());
    clahe.apply(blurred, equalized);

    const totalImageArea = processWidth * processHeight;
    const minArea = totalImageArea * 0.05; // Document should occupy at least 5% of the frame
    const candidateQuads: { corners: Point[]; area: number; score: number }[] = [];

    const evaluateContour = (contour: any, weight: number = 1.0) => {
      const area = cv.contourArea(contour);
      if (area < minArea) return;

      const peri = cv.arcLength(contour, true);

      // Direct polygon approximation with multiple epsilons
      for (const eps of [0.015, 0.02, 0.025, 0.03, 0.04]) {
        const approx = track(new cv.Mat());
        cv.approxPolyDP(contour, approx, eps * peri, true);
        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          const pts: Point[] = [];
          for (let j = 0; j < 4; j++) {
            pts.push({ x: approx.intPtr(j, 0)[0], y: approx.intPtr(j, 0)[1] });
          }
          if (isValidQuad(pts)) {
            const areaRatio = area / totalImageArea;
            const borderPenalty = areaRatio > 0.98 ? 0.5 : 1.0;
            candidateQuads.push({
              corners: pts,
              area,
              score: areaRatio * borderPenalty * weight,
            });
          }
        }
      }

      // Convex Hull + Max Area Quad (handles folded/rounded corners and staple pins)
      const hull = track(new cv.Mat());
      cv.convexHull(contour, hull);
      const hullPeri = cv.arcLength(hull, true);

      const hullApprox = track(new cv.Mat());
      cv.approxPolyDP(hull, hullApprox, 0.02 * hullPeri, true);

      const hullPts: Point[] = [];
      for (let j = 0; j < hullApprox.rows; j++) {
        hullPts.push({ x: hullApprox.intPtr(j, 0)[0], y: hullApprox.intPtr(j, 0)[1] });
      }

      if (hullPts.length >= 4) {
        const maxQuad = findMaxAreaQuad(hullPts);
        if (maxQuad && isValidQuad(maxQuad)) {
          const quadArea = shoelaceArea(maxQuad);
          const areaRatio = quadArea / totalImageArea;
          const borderPenalty = areaRatio > 0.98 ? 0.5 : 1.0;
          candidateQuads.push({
            corners: maxQuad,
            area: quadArea,
            score: areaRatio * borderPenalty * weight * 0.95,
          });
        }
      }
    };

    // Strategi 1: Adaptive thresholding (tahan bayangan dan pencahayaan tidak merata)
    const adaptiveThresh = track(new cv.Mat());
    cv.adaptiveThreshold(blurred, adaptiveThresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 51, -8);

    const closeKernel = track(cv.Mat.ones(5, 5, cv.CV_8U));
    const closedAdaptive = track(new cv.Mat());
    cv.morphologyEx(adaptiveThresh, closedAdaptive, cv.MORPH_CLOSE, closeKernel);

    const contoursAdaptive = track(new cv.MatVector());
    const hierAdaptive = track(new cv.Mat());
    cv.findContours(closedAdaptive, contoursAdaptive, hierAdaptive, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    for (let i = 0; i < contoursAdaptive.size(); i++) {
      evaluateContour(contoursAdaptive.get(i), 1.2);
    }

    // Strategi 2: CLAHE + Canny (efektif untuk kertas putih di meja terang / low-contrast)
    const edgesClahe = track(new cv.Mat());
    cv.Canny(equalized, edgesClahe, 35, 110);
    const dilateKernel = track(cv.Mat.ones(3, 3, cv.CV_8U));
    const dilatedClahe = track(new cv.Mat());
    cv.dilate(edgesClahe, dilatedClahe, dilateKernel);

    const contoursClahe = track(new cv.MatVector());
    const hierClahe = track(new cv.Mat());
    cv.findContours(dilatedClahe, contoursClahe, hierClahe, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    for (let i = 0; i < contoursClahe.size(); i++) {
      evaluateContour(contoursClahe.get(i), 1.0);
    }

    // Strategi 3: Canny standar (efektif untuk background kontras tinggi)
    const edgesStd = track(new cv.Mat());
    cv.Canny(blurred, edgesStd, 50, 150);
    const dilatedStd = track(new cv.Mat());
    cv.dilate(edgesStd, dilatedStd, dilateKernel);

    const contoursStd = track(new cv.MatVector());
    const hierStd = track(new cv.Mat());
    cv.findContours(dilatedStd, contoursStd, hierStd, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    for (let i = 0; i < contoursStd.size(); i++) {
      evaluateContour(contoursStd.get(i), 1.0);
    }

    if (candidateQuads.length > 0) {
      candidateQuads.sort((a, b) => b.score - a.score);
      const best = candidateQuads[0];

      // Map scaled coordinates back to full resolution
      const invScale = 1.0 / scale;
      const rawCorners: Point[] = best.corners.map((p) => ({
        x: Math.min(srcWidth, Math.max(0, Math.round(p.x * invScale))),
        y: Math.min(srcHeight, Math.max(0, Math.round(p.y * invScale))),
      }));

      const orderedCorners = orderCorners(rawCorners);
      const confidence = Math.min(0.98, Math.max(0.68, best.score));

      return {
        corners: orderedCorners,
        confidence,
        found: true,
        sourceWidth: srcWidth,
        sourceHeight: srcHeight,
      };
    }

    // Fallback: Low confidence
    return {
      corners: getDefaultCorners(srcWidth, srcHeight, 0.08),
      confidence: 0,
      found: false,
      message: 'Automatic boundary detection had low confidence. Corner handles are ready for manual adjustment.',
      sourceWidth: srcWidth,
      sourceHeight: srcHeight,
    };
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
