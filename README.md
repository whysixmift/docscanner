# Dokumen Scanner

A client-side document scanner built with Next.js and OpenCV.js. Automatically detects document boundaries, straightens perspective, and enhances readability.

## Getting Started

First, install dependencies:

```bash
pnpm install
```

Run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Features

- Real-time camera capture with document boundary auto-detection
- Manual 4-corner adjustment with loupe magnifier
- Perspective warping to straighten skewed documents
- Image enhancements (Color, Grayscale, B&W photocopy)
- Client-side processing (no data sent to external servers)
- Image export in JPG and PNG formats
