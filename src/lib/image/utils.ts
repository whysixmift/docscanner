/**
 * Helper to load an image source (data URL or blob URL) into an HTMLImageElement
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image source'));
    img.src = src;
  });
}

/**
 * Read File object as Data URL
 */
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file as string'));
      }
    };
    reader.onerror = () => reject(new Error('Error reading file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Trigger browser file download from canvas or dataURL
 */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Convert canvas to Blob
 */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string = 'image/jpeg',
  quality: number = 0.92
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to Blob'));
        }
      },
      type,
      quality
    );
  });
}

/**
 * Rotate an image / canvas by 90, 180, 270 degrees
 */
export function rotateCanvas(
  sourceCanvas: HTMLCanvasElement,
  angleDegrees: 90 | 180 | 270
): HTMLCanvasElement {
  const rotated = document.createElement('canvas');
  const rad = (angleDegrees * Math.PI) / 180;

  if (angleDegrees === 90 || angleDegrees === 270) {
    rotated.width = sourceCanvas.height;
    rotated.height = sourceCanvas.width;
  } else {
    rotated.width = sourceCanvas.width;
    rotated.height = sourceCanvas.height;
  }

  const ctx = rotated.getContext('2d');
  if (!ctx) return sourceCanvas;

  ctx.translate(rotated.width / 2, rotated.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);

  return rotated;
}
