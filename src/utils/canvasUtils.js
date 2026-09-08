export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

export function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve({ img, url });
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

/** Draw an HTMLImageElement onto a canvas at a target width, preserving aspect ratio. */
export function drawToCanvas(img, targetWidth = null) {
  const canvas = document.createElement('canvas');
  const scale = targetWidth ? targetWidth / img.naturalWidth : 1;
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

export function getImageData(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** Crop a region [x,y,w,h] (in canvas pixel coords) from a source canvas into a new canvas. */
export function cropCanvas(sourceCanvas, x, y, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(
    sourceCanvas,
    Math.round(x), Math.round(y), Math.round(w), Math.round(h),
    0, 0, canvas.width, canvas.height
  );
  return canvas;
}

export function canvasToDataUrl(canvas, type = 'image/png') {
  return canvas.toDataURL(type);
}
