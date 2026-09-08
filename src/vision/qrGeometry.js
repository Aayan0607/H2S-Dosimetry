/** Convert jsQR candidate-local coordinates back to the source ImageData space. */
export function mapLocationToSource(location, transform) {
  if (!location || !transform) return location;
  const mapPoint = (point) => point ? {
    x: transform.offsetX + point.x / transform.scaleX,
    y: transform.offsetY + point.y / transform.scaleY,
  } : point;

  return Object.fromEntries(
    Object.entries(location).map(([key, point]) => [key, mapPoint(point)])
  );
}

/** Apply a working-canvas scale and/or crop offset to every QR corner. */
export function remapQrResult(qr, { offsetX = 0, offsetY = 0, scaleX = 1, scaleY = 1 } = {}) {
  if (!qr?.location) return qr;
  const location = Object.fromEntries(
    Object.entries(qr.location).map(([key, point]) => [key, point ? {
      x: offsetX + point.x * scaleX,
      y: offsetY + point.y * scaleY,
    } : point])
  );
  return { ...qr, location };
}
