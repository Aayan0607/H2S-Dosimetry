import test from 'node:test';
import assert from 'node:assert/strict';

import { mapLocationToSource, remapQrResult } from '../src/vision/qrGeometry.js';

const location = {
  topLeftCorner: { x: 10, y: 20 },
  topRightCorner: { x: 50, y: 20 },
  bottomLeftCorner: { x: 10, y: 60 },
  bottomRightCorner: { x: 50, y: 60 },
};

test('maps a scaled and cropped QR candidate back to source-image coordinates', () => {
  const mapped = mapLocationToSource(location, {
    offsetX: 400,
    offsetY: 100,
    scaleX: 0.5,
    scaleY: 0.25,
  });

  assert.deepEqual(mapped.topLeftCorner, { x: 420, y: 180 });
  assert.deepEqual(mapped.bottomRightCorner, { x: 500, y: 340 });
});

test('maps original-resolution QR coordinates into the working canvas', () => {
  const mapped = remapQrResult(
    { found: true, location },
    { scaleX: 0.25, scaleY: 0.25 }
  );

  assert.deepEqual(mapped.location.topLeftCorner, { x: 2.5, y: 5 });
  assert.deepEqual(mapped.location.bottomRightCorner, { x: 12.5, y: 15 });
});

test('adds the badge-crop offset to a secondary QR result', () => {
  const mapped = remapQrResult(
    { found: true, location },
    { offsetX: 225, offsetY: 75 }
  );

  assert.deepEqual(mapped.location.topLeftCorner, { x: 235, y: 95 });
  assert.deepEqual(mapped.location.bottomRightCorner, { x: 275, y: 135 });
});
