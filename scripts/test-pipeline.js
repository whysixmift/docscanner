const fs = require('fs');
const path = require('path');

// Load OpenCV.js
async function runTests() {
  const cvPromise = require('../public/opencv.js');
  const cv = await cvPromise;
  console.log('OpenCV loaded successfully.');

  // Helper to order corners
  function orderCorners(pts) {
    const cx = pts.reduce((sum, p) => sum + p.x, 0) / 4;
    const cy = pts.reduce((sum, p) => sum + p.y, 0) / 4;

    const clockwise = [...pts].sort((a, b) => {
      const angleA = Math.atan2(a.y - cy, a.x - cx);
      const angleB = Math.atan2(b.y - cy, b.x - cx);
      return angleA - angleB;
    });

    let tlIdx = 0;
    let minScore = Infinity;
    for (let i = 0; i < clockwise.length; i++) {
      const distSq = clockwise[i].x * clockwise[i].x + clockwise[i].y * clockwise[i].y;
      if (distSq < minScore) {
        minScore = distSq;
        tlIdx = i;
      }
    }

    return [
      clockwise[tlIdx],
      clockwise[(tlIdx + 1) % 4],
      clockwise[(tlIdx + 2) % 4],
      clockwise[(tlIdx + 3) % 4],
    ];
  }

  function isValidQuad(corners) {
    if (corners.length !== 4) return false;
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      const dist = Math.hypot(corners[next].x - corners[i].x, corners[next].y - corners[i].y);
      if (dist < 20) return false;
    }
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
      if (Math.abs(cosTheta) > 0.85) return false;
    }
    return true;
  }

  // Simulated detection pipeline on a cv.Mat
  function detectDocumentMat(srcMat) {
    const srcWidth = srcMat.cols;
    const srcHeight = srcMat.rows;
    const MAX_PROCESSING_DIM = 900;
    let scale = 1.0;
    let processWidth = srcWidth;
    let processHeight = srcHeight;
    if (Math.max(srcWidth, srcHeight) > MAX_PROCESSING_DIM) {
      scale = MAX_PROCESSING_DIM / Math.max(srcWidth, srcHeight);
      processWidth = Math.round(srcWidth * scale);
      processHeight = Math.round(srcHeight * scale);
    }

    const matsToClean = [];
    const track = (m) => { matsToClean.push(m); return m; };

    try {
      const scaled = track(new cv.Mat());
      cv.resize(srcMat, scaled, new cv.Size(processWidth, processHeight), 0, 0, cv.INTER_AREA);

      const gray = track(new cv.Mat());
      if (scaled.channels() === 4) {
        cv.cvtColor(scaled, gray, cv.COLOR_RGBA2GRAY);
      } else if (scaled.channels() === 3) {
        cv.cvtColor(scaled, gray, cv.COLOR_BGR2GRAY);
      } else {
        scaled.copyTo(gray);
      }

      const blurred = track(new cv.Mat());
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

      const candidateQuads = [];

      const tryFindContoursOnEdges = (edgeMat) => {
        const kernel = track(cv.Mat.ones(3, 3, cv.CV_8U));
        const dilated = track(new cv.Mat());
        cv.dilate(edgeMat, dilated, kernel);

        const contours = track(new cv.MatVector());
        const hierarchy = track(new cv.Mat());
        cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

        const totalImageArea = processWidth * processHeight;
        const minArea = totalImageArea * 0.08;

        for (let i = 0; i < contours.size(); i++) {
          const contour = contours.get(i);
          const area = cv.contourArea(contour);
          if (area < minArea) continue;

          const peri = cv.arcLength(contour, true);
          for (const epsFactor of [0.02, 0.03, 0.015, 0.04]) {
            const approx = track(new cv.Mat());
            cv.approxPolyDP(contour, approx, epsFactor * peri, true);
            if (approx.rows === 4 && cv.isContourConvex(approx)) {
              const pts = [];
              for (let j = 0; j < 4; j++) {
                pts.push({ x: approx.intPtr(j, 0)[0], y: approx.intPtr(j, 0)[1] });
              }
              if (isValidQuad(pts)) {
                const areaRatio = area / totalImageArea;
                const borderPenalty = areaRatio > 0.98 ? 0.6 : 1.0;
                candidateQuads.push({ corners: pts, area, score: areaRatio * borderPenalty });
              }
            }
          }

          const hull = track(new cv.Mat());
          cv.convexHull(contour, hull);
          const hullPeri = cv.arcLength(hull, true);
          const hullApprox = track(new cv.Mat());
          cv.approxPolyDP(hull, hullApprox, 0.025 * hullPeri, true);
          if (hullApprox.rows === 4 && cv.isContourConvex(hullApprox)) {
            const pts = [];
            for (let j = 0; j < 4; j++) {
              pts.push({ x: hullApprox.intPtr(j, 0)[0], y: hullApprox.intPtr(j, 0)[1] });
            }
            if (isValidQuad(pts)) {
              candidateQuads.push({ corners: pts, area, score: (area / totalImageArea) * 0.9 });
            }
          }
        }
      };

      // Strategy A: Standard Canny
      const edgesA = track(new cv.Mat());
      cv.Canny(blurred, edgesA, 50, 150);
      tryFindContoursOnEdges(edgesA);

      // Strategy B
      if (candidateQuads.length === 0) {
        const edgesB = track(new cv.Mat());
        cv.Canny(blurred, edgesB, 30, 100);
        tryFindContoursOnEdges(edgesB);
      }

      // Strategy C
      if (candidateQuads.length === 0) {
        const morphEdges = track(new cv.Mat());
        cv.adaptiveThreshold(blurred, morphEdges, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 15, 8);
        tryFindContoursOnEdges(morphEdges);
      }

      if (candidateQuads.length > 0) {
        candidateQuads.sort((a, b) => b.score - a.score);
        const best = candidateQuads[0];
        const invScale = 1.0 / scale;
        const rawCorners = best.corners.map((p) => ({
          x: Math.min(srcWidth, Math.max(0, Math.round(p.x * invScale))),
          y: Math.min(srcHeight, Math.max(0, Math.round(p.y * invScale))),
        }));
        return { found: true, corners: orderCorners(rawCorners), score: best.score };
      }

      return { found: false, corners: null };
    } finally {
      for (const m of matsToClean) {
        try { m.delete(); } catch(e) {}
      }
    }
  }

  // TEST CASES
  const testCases = [
    {
      name: '1. Standard dark background with tilted document',
      bg: 40, paper: 240,
      quad: [{x: 100, y: 80}, {x: 700, y: 120}, {x: 650, y: 550}, {x: 120, y: 500}],
      shadow: false,
    },
    {
      name: '2. Light background (e.g. white/light beige desk - low contrast)',
      bg: 210, paper: 250, // Contrast difference is only 40!
      quad: [{x: 150, y: 100}, {x: 680, y: 90}, {x: 670, y: 520}, {x: 140, y: 510}],
      shadow: false,
    },
    {
      name: '3. Strong cast shadow across paper',
      bg: 50, paper: 240,
      quad: [{x: 120, y: 90}, {x: 660, y: 110}, {x: 620, y: 530}, {x: 130, y: 500}],
      shadow: true,
    },
    {
      name: '4. Severe perspective distortion (photographed from bottom angle)',
      bg: 35, paper: 245,
      // Trapezoid: top is narrow (300 to 500 = 200px), bottom is wide (80 to 720 = 640px)
      quad: [{x: 280, y: 60}, {x: 520, y: 60}, {x: 740, y: 550}, {x: 60, y: 550}],
      shadow: false,
    },
    {
      name: '5. Small document occupying only ~15% of the frame',
      bg: 45, paper: 240,
      quad: [{x: 250, y: 180}, {x: 550, y: 200}, {x: 530, y: 440}, {x: 240, y: 420}],
      shadow: false,
    },
    {
      name: '6. Rotated document (approx 45 degrees diagonal)',
      bg: 40, paper: 240,
      quad: [{x: 400, y: 60}, {x: 720, y: 300}, {x: 420, y: 560}, {x: 100, y: 320}],
      shadow: false,
    },
    {
      name: '7. Uneven lighting / Gradient across image',
      bg: 40, paper: 240,
      quad: [{x: 140, y: 90}, {x: 660, y: 120}, {x: 620, y: 520}, {x: 150, y: 480}],
      gradient: true,
    }
  ];

  console.log('\n================ RUNNING PIPELINE AUDIT ================\n');

  let passedCount = 0;

  for (const tc of testCases) {
    const W = 800, H = 600;
    const mat = new cv.Mat(H, W, cv.CV_8UC1, new cv.Scalar(tc.bg));

    // If gradient
    if (tc.gradient) {
      for (let r = 0; r < H; r++) {
        for (let c = 0; c < W; c++) {
          const grad = (c / W) * 80;
          mat.ucharPtr(r, c)[0] = Math.min(255, tc.bg + grad);
        }
      }
    }

    // Draw paper quad
    const ptVector = new cv.MatVector();
    const contourMat = new cv.Mat(4, 1, cv.CV_32SC2);
    for (let i = 0; i < 4; i++) {
      contourMat.intPtr(i, 0)[0] = tc.quad[i].x;
      contourMat.intPtr(i, 0)[1] = tc.quad[i].y;
    }
    ptVector.push_back(contourMat);
    cv.fillPoly(mat, ptVector, new cv.Scalar(tc.paper));

    // If cast shadow
    if (tc.shadow) {
      // Dark shadow across the right half of the image
      for (let r = 0; r < H; r++) {
        for (let c = 400; c < W; c++) {
          const val = mat.ucharPtr(r, c)[0];
          mat.ucharPtr(r, c)[0] = Math.max(0, val - 110);
        }
      }
    }

    const res = detectDocumentMat(mat);

    mat.delete(); ptVector.delete(); contourMat.delete();

    if (res.found) {
      // Calculate IoU or distance between detected corners and ground truth
      const maxDist = Math.max(...res.corners.map((p, idx) => {
        // find closest ground truth point
        const minDistToAny = Math.min(...tc.quad.map(gt => Math.hypot(gt.x - p.x, gt.y - p.y)));
        return minDistToAny;
      }));

      if (maxDist < 25) {
        console.log(`[PASS] ${tc.name}`);
        console.log(`       Corners detected accurately (max corner err: ${maxDist.toFixed(1)}px)`);
        passedCount++;
      } else {
        console.log(`[WARN] ${tc.name}`);
        console.log(`       Found quad, but corner displacement is high: ${maxDist.toFixed(1)}px`);
        console.log(`       Detected:`, res.corners);
        console.log(`       Actual:`, tc.quad);
      }
    } else {
      console.log(`[FAIL] ${tc.name} -> NOT DETECTED!`);
    }
  }

  console.log(`\nResults: ${passedCount} / ${testCases.length} passed.`);
}

runTests().catch(console.error);
