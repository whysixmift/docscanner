const fs = require('fs');

async function testImprovedDetector() {
  const cvPromise = require('../public/opencv.js');
  const cv = await cvPromise;

  function shoelaceArea(pts) {
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    return Math.abs(area) / 2;
  }

  function findMaxAreaQuad(hullPts) {
    const n = hullPts.length;
    if (n === 4) return hullPts;
    if (n < 4) return null;

    let maxArea = 0;
    let bestQuad = null;

    for (let i = 0; i < n - 3; i++) {
      for (let j = i + 1; j < n - 2; j++) {
        for (let k = j + 1; k < n - 1; k++) {
          for (let l = k + 1; l < n; l++) {
            const quad = [hullPts[i], hullPts[j], hullPts[k], hullPts[l]];
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
      if (Math.abs(cosTheta) > 0.88) return false;
    }
    return true;
  }

  function detectDocumentRobust(srcMat) {
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

      // Gentle blur
      const blurred = track(new cv.Mat());
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

      // CLAHE for local contrast enhancement
      const clahe = track(new cv.CLAHE(3.0, new cv.Size(8, 8)));
      const equalized = track(new cv.Mat());
      clahe.apply(blurred, equalized);

      const totalImageArea = processWidth * processHeight;
      const minArea = totalImageArea * 0.05;
      const candidateQuads = [];

      const evaluateContour = (contour, weight = 1.0) => {
        const area = cv.contourArea(contour);
        if (area < minArea) return;

        const peri = cv.arcLength(contour, true);

        // Try direct polygon approximation with various epsilons
        for (const eps of [0.015, 0.02, 0.025, 0.03, 0.04]) {
          const approx = track(new cv.Mat());
          cv.approxPolyDP(contour, approx, eps * peri, true);
          if (approx.rows === 4 && cv.isContourConvex(approx)) {
            const pts = [];
            for (let j = 0; j < 4; j++) {
              pts.push({ x: approx.intPtr(j, 0)[0], y: approx.intPtr(j, 0)[1] });
            }
            if (isValidQuad(pts)) {
              const areaRatio = area / totalImageArea;
              const borderPenalty = areaRatio > 0.98 ? 0.5 : 1.0;
              candidateQuads.push({ corners: pts, area, score: areaRatio * borderPenalty * weight });
            }
          }
        }

        // Also test Convex Hull + Max Area Quad (handles folded/rounded corners!)
        const hull = track(new cv.Mat());
        cv.convexHull(contour, hull);
        const hullPeri = cv.arcLength(hull, true);

        // Approximate hull
        const hullApprox = track(new cv.Mat());
        cv.approxPolyDP(hull, hullApprox, 0.02 * hullPeri, true);

        const hullPts = [];
        for (let j = 0; j < hullApprox.rows; j++) {
          hullPts.push({ x: hullApprox.intPtr(j, 0)[0], y: hullApprox.intPtr(j, 0)[1] });
        }

        if (hullPts.length >= 4) {
          const maxQuad = findMaxAreaQuad(hullPts);
          if (maxQuad && isValidQuad(maxQuad)) {
            const quadArea = shoelaceArea(maxQuad);
            const areaRatio = quadArea / totalImageArea;
            const borderPenalty = areaRatio > 0.98 ? 0.5 : 1.0;
            candidateQuads.push({ corners: maxQuad, area: quadArea, score: areaRatio * borderPenalty * weight * 0.95 });
          }
        }
      };

      // --- STRATEGY 1: Adaptive Threshold (Dominates in cast shadows & lighting gradients) ---
      const adaptiveThresh = track(new cv.Mat());
      // Gaussian adaptive threshold with large window (51)
      cv.adaptiveThreshold(blurred, adaptiveThresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 51, -8);
      
      // Morphological close to bridge any gaps
      const closeKernel = track(cv.Mat.ones(5, 5, cv.CV_8U));
      const closedAdaptive = track(new cv.Mat());
      cv.morphologyEx(adaptiveThresh, closedAdaptive, cv.MORPH_CLOSE, closeKernel);

      const contoursAdaptive = track(new cv.MatVector());
      const hierAdaptive = track(new cv.Mat());
      cv.findContours(closedAdaptive, contoursAdaptive, hierAdaptive, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      for (let i = 0; i < contoursAdaptive.size(); i++) {
        evaluateContour(contoursAdaptive.get(i), 1.15); // Higher weight for external adaptive contours
      }

      // --- STRATEGY 2: CLAHE Equalized Canny (Dominates in low contrast & light backgrounds) ---
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

      // --- STRATEGY 3: Standard Blurred Canny (High precision on clean backgrounds) ---
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

  // ALL TEST CASES
  const testCases = [
    {
      name: '1. Standard dark background with tilted document',
      bg: 40, paper: 240,
      quad: [{x: 100, y: 80}, {x: 700, y: 120}, {x: 650, y: 550}, {x: 120, y: 500}],
    },
    {
      name: '2. Light background (e.g. white/light beige desk - low contrast)',
      bg: 215, paper: 245,
      quad: [{x: 150, y: 100}, {x: 680, y: 90}, {x: 670, y: 520}, {x: 140, y: 510}],
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
      quad: [{x: 280, y: 60}, {x: 520, y: 60}, {x: 740, y: 550}, {x: 60, y: 550}],
    },
    {
      name: '5. Small document occupying ~15% of frame',
      bg: 45, paper: 240,
      quad: [{x: 250, y: 180}, {x: 550, y: 200}, {x: 530, y: 440}, {x: 240, y: 420}],
    },
    {
      name: '6. Rotated document (approx 45 degrees diagonal)',
      bg: 40, paper: 240,
      quad: [{x: 400, y: 60}, {x: 720, y: 300}, {x: 420, y: 560}, {x: 100, y: 320}],
    },
    {
      name: '7. Uneven lighting / Gradient across image',
      bg: 40, paper: 240,
      quad: [{x: 140, y: 90}, {x: 660, y: 120}, {x: 620, y: 520}, {x: 150, y: 480}],
      gradient: true,
    },
    {
      name: '8. Folded / clipped corner document (pentagon)',
      bg: 45, paper: 240,
      polygon: [
        {x: 120, y: 80},
        {x: 620, y: 95},
        {x: 680, y: 150},
        {x: 640, y: 530},
        {x: 130, y: 500}
      ],
      expectedQuad: [{x: 120, y: 80}, {x: 680, y: 95}, {x: 640, y: 530}, {x: 130, y: 500}],
    },
    {
      name: '9. Very large document occupying ~85% of frame',
      bg: 30, paper: 245,
      quad: [{x: 40, y: 35}, {x: 760, y: 40}, {x: 755, y: 565}, {x: 45, y: 560}],
    }
  ];

  console.log('\n================ ROBUST DETECTOR AUDIT ================\n');
  let passed = 0;

  for (const tc of testCases) {
    const W = 800, H = 600;
    const mat = new cv.Mat(H, W, cv.CV_8UC1, new cv.Scalar(tc.bg));

    if (tc.gradient) {
      for (let r = 0; r < H; r++) {
        for (let c = 0; c < W; c++) {
          const grad = (c / W) * 80;
          mat.ucharPtr(r, c)[0] = Math.min(255, tc.bg + grad);
        }
      }
    }

    const poly = tc.polygon || tc.quad;
    const ptVector = new cv.MatVector();
    const contourMat = new cv.Mat(poly.length, 1, cv.CV_32SC2);
    for (let i = 0; i < poly.length; i++) {
      contourMat.intPtr(i, 0)[0] = poly[i].x;
      contourMat.intPtr(i, 0)[1] = poly[i].y;
    }
    ptVector.push_back(contourMat);
    cv.fillPoly(mat, ptVector, new cv.Scalar(tc.paper));

    if (tc.shadow) {
      for (let r = 0; r < H; r++) {
        for (let c = 400; c < W; c++) {
          const val = mat.ucharPtr(r, c)[0];
          mat.ucharPtr(r, c)[0] = Math.max(0, val - 110);
        }
      }
    }

    const res = detectDocumentRobust(mat);
    mat.delete(); ptVector.delete(); contourMat.delete();

    const expected = tc.expectedQuad || tc.quad;

    if (res.found) {
      const maxDist = Math.max(...res.corners.map((p) => {
        return Math.min(...expected.map(gt => Math.hypot(gt.x - p.x, gt.y - p.y)));
      }));

      if (maxDist < 25) {
        console.log(`[PASS] ${tc.name} (error: ${maxDist.toFixed(1)}px)`);
        passed++;
      } else {
        console.log(`[WARN] ${tc.name} (error: ${maxDist.toFixed(1)}px)`);
        console.log('       Detected:', res.corners);
        console.log('       Expected:', expected);
      }
    } else {
      console.log(`[FAIL] ${tc.name} - Not detected`);
    }
  }

  console.log(`\nFinal Score: ${passed} / ${testCases.length} Passed!`);
}

testImprovedDetector().catch(console.error);
