import { jsPDF } from 'jspdf';
import { ScannedPage } from '../opencv/types';
import { loadImage } from '../image/utils';

export interface PdfExportOptions {
  pageSize?: 'a4' | 'fit';
  marginMm?: number;
  filename?: string;
}

/**
 * Export scanned pages into a clean, professional multi-page or single-page PDF
 */
export async function exportPagesToPdf(
  pages: ScannedPage[],
  options: PdfExportOptions = {}
): Promise<Blob> {
  if (pages.length === 0) {
    throw new Error('No pages to export');
  }

  const {
    pageSize = 'a4',
    marginMm = 10,
    filename = `scan-${new Date().toISOString().slice(0, 10)}.pdf`,
  } = options;

  let doc: jsPDF | null = null;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const img = await loadImage(page.processedDataUrl);
    const imgWidth = img.naturalWidth || img.width;
    const imgHeight = img.naturalHeight || img.height;
    const imgAspect = imgWidth / imgHeight;

    if (pageSize === 'a4') {
      // Standard A4: 210 x 297 mm
      const isLandscape = imgAspect > 1.15;
      const orientation = isLandscape ? 'l' : 'p';
      const pageWidth = isLandscape ? 297 : 210;
      const pageHeight = isLandscape ? 210 : 297;

      if (i === 0) {
        doc = new jsPDF({
          orientation,
          unit: 'mm',
          format: 'a4',
          compress: true,
        });
      } else {
        doc!.addPage('a4', orientation);
      }

      // Calculate maximum fit within margins
      const maxAvailableW = pageWidth - marginMm * 2;
      const maxAvailableH = pageHeight - marginMm * 2;

      let renderW = maxAvailableW;
      let renderH = renderW / imgAspect;

      if (renderH > maxAvailableH) {
        renderH = maxAvailableH;
        renderW = renderH * imgAspect;
      }

      // Center the document on the page
      const posX = marginMm + (maxAvailableW - renderW) / 2;
      const posY = marginMm + (maxAvailableH - renderH) / 2;

      doc!.addImage(page.processedDataUrl, 'JPEG', posX, posY, renderW, renderH, undefined, 'FAST');
    } else {
      // 'fit': Page size strictly matches document aspect ratio (in mm, ~300 DPI scale)
      const scaleFactor = 0.264583; // 1 px ~ 0.264583 mm at 96 dpi
      const widthMm = Math.max(50, Math.min(600, imgWidth * scaleFactor));
      const heightMm = widthMm / imgAspect;
      const orientation = imgAspect > 1 ? 'l' : 'p';

      if (i === 0) {
        doc = new jsPDF({
          orientation,
          unit: 'mm',
          format: [widthMm, heightMm],
          compress: true,
        });
      } else {
        doc!.addPage([widthMm, heightMm], orientation);
      }

      doc!.addImage(page.processedDataUrl, 'JPEG', 0, 0, widthMm, heightMm, undefined, 'FAST');
    }
  }

  if (!doc) {
    throw new Error('Failed to initialize PDF generator');
  }

  // Trigger download if in browser
  doc.save(filename);

  return doc.output('blob');
}
