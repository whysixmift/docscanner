// Sumber CDN & fallback lokal untuk OpenCV WebAssembly
const OPENCV_SOURCES: string[] = [
  'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@5.0.0-release.1/dist/opencv.js',
  'https://unpkg.com/@techstark/opencv-js@5.0.0-release.1/dist/opencv.js',
  '/opencv.js',
];

// Singleton promise untuk mencegah script di-inject berulang kali jika user klik berkali-kali
let cvPromise: Promise<any> | null = null;
let currentStatus = 'Connecting...';
const statusListeners = new Set<(status: string) => void>();

function notifyStatus(status: string) {
  currentStatus = status;
  for (const listener of statusListeners) {
    try {
      listener(status);
    } catch (e) {
      console.error('Status listener error:', e);
    }
  }
}

export function subscribeOpenCVStatus(listener: (status: string) => void): () => void {
  statusListeners.add(listener);
  listener(currentStatus);
  return () => {
    statusListeners.delete(listener);
  };
}

export function isOpenCVReady(): boolean {
  if (typeof window === 'undefined') return false;
  const inst = (window as any)._cvReadyInstance || (window as any).cv;
  return !!(inst && inst.Mat && typeof inst.Mat === 'function');
}

export function getOpenCVInstance(): any {
  if (typeof window === 'undefined') return null;
  const inst = (window as any)._cvReadyInstance || (window as any).cv;
  if (inst && inst.Mat && typeof inst.Mat === 'function') {
    return inst;
  }
  return null;
}

export function resetOpenCVLoader(): void {
  cvPromise = null;
  notifyStatus('Ready to retry');
  if (typeof document !== 'undefined') {
    const scripts = document.querySelectorAll('script[data-opencv-loader]');
    scripts.forEach((s) => s.remove());
  }
}

function tryLoadSource(src: string, isFallback: boolean): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return reject(new Error('Window not available'));
    }

    notifyStatus(isFallback ? 'Trying fallback server...' : 'Downloading engine...');

    let isDone = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      isDone = true;
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    // Pre-hook Module configuration for Emscripten runtime
    (window as any).Module = (window as any).Module || {};
    const existingOnInit = (window as any).Module.onRuntimeInitialized;
    (window as any).Module.onRuntimeInitialized = () => {
      if (existingOnInit) {
        try {
          existingOnInit();
        } catch {
          // Ignore
        }
      }
      checkReady();
    };

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.setAttribute('data-opencv-loader', 'true');

    async function checkReady(): Promise<boolean> {
      if (isDone) return true;
      const rawCv = (window as any).cv;
      if (!rawCv) return false;

      // Handle Promise-based OpenCV (e.g. @techstark/opencv-js)
      if (typeof rawCv.then === 'function') {
        notifyStatus('Compiling WASM...');
        try {
          const inst = await rawCv;
          if (inst && inst.Mat && typeof inst.Mat === 'function') {
            cleanup();
            (window as any)._cvReadyInstance = inst;
            (window as any).cv = inst;
            resolve(inst);
            return true;
          }
        } catch (err) {
          cleanup();
          reject(err);
          return true;
        }
      }

      // Handle synchronous or already initialized OpenCV
      if (rawCv.Mat && typeof rawCv.Mat === 'function') {
        cleanup();
        (window as any)._cvReadyInstance = rawCv;
        resolve(rawCv);
        return true;
      }

      // If object with onRuntimeInitialized callback
      if (typeof rawCv === 'object' && !rawCv.onRuntimeInitialized) {
        rawCv.onRuntimeInitialized = () => {
          checkReady();
        };
      }

      return false;
    }

    script.onload = () => {
      notifyStatus('Compiling WASM...');
      void checkReady();
    };

    script.onerror = () => {
      cleanup();
      script.remove();
      reject(new Error(`Failed to load OpenCV script from ${src}`));
    };

    // Poll every 50ms to detect when WASM compilation completes
    pollInterval = setInterval(() => {
      void checkReady();
    }, 50);

    // Timeout: 22s for CDN sources, 40s for local fallback
    const timeoutMs = src.startsWith('http') ? 22000 : 40000;
    timeoutId = setTimeout(() => {
      cleanup();
      script.remove();
      reject(new Error(`Loading timed out from ${src}`));
    }, timeoutMs);

    document.head.appendChild(script);
  });
}

export async function loadOpenCV(): Promise<any> {
  if (typeof window === 'undefined') return null;

  // Already initialized instance
  if (isOpenCVReady()) {
    notifyStatus('CV Ready');
    return getOpenCVInstance();
  }

  if (cvPromise) {
    return cvPromise;
  }

  cvPromise = (async () => {
    // Check if window.cv was already injected and ready
    const existingCv = (window as any).cv;
    if (existingCv) {
      if (typeof existingCv.then === 'function') {
        notifyStatus('Compiling WASM...');
        const resolved = await existingCv;
        if (resolved && resolved.Mat) {
          (window as any)._cvReadyInstance = resolved;
          (window as any).cv = resolved;
          notifyStatus('CV Ready');
          return resolved;
        }
      } else if (existingCv.Mat) {
        (window as any)._cvReadyInstance = existingCv;
        notifyStatus('CV Ready');
        return existingCv;
      }
    }

    let lastError: Error | null = null;

    for (let i = 0; i < OPENCV_SOURCES.length; i++) {
      const src = OPENCV_SOURCES[i];
      try {
        const inst = await tryLoadSource(src, i > 0);
        if (inst && inst.Mat) {
          notifyStatus('CV Ready');
          return inst;
        }
      } catch (err: unknown) {
        console.warn(`[OpenCV Loader] Source ${src} failed:`, err);
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    // All sources failed
    cvPromise = null;
    notifyStatus('Load failed');
    throw lastError || new Error('All OpenCV sources failed to load');
  })();

  return cvPromise;
}
