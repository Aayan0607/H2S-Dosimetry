import { useRef, useState, useEffect } from 'react';

/**
 * Renders a canvas image (already-processed working canvas) scaled to fit,
 * with an overlay rectangle showing either the auto-detected sensing region
 * or a user-draggable manual selection.
 *
 * Coordinates for `roi` and `onRoiChange` are always in the *source canvas'*
 * pixel space (i.e. workingCanvas.width/height), not the displayed CSS size.
 */
export default function ImageRoiOverlay({
  workingCanvas,
  roi,
  editable = false,
  onRoiChange,
  label = 'Analyzed Region',
}) {
  const containerRef = useRef(null);
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const [dragState, setDragState] = useState(null);

  useEffect(() => {
    if (!containerRef.current || !workingCanvas) return;
    const cw = workingCanvas.width, ch = workingCanvas.height;
    const maxW = containerRef.current.clientWidth;
    const scale = Math.min(1, maxW / cw);
    setDisplaySize({ w: cw * scale, h: ch * scale, scale });
  }, [workingCanvas, workingCanvas?.width]);

  if (!workingCanvas) return null;

  const dataUrl = workingCanvas.toDataURL('image/png');
  const scale = displaySize.scale || 1;

  function toSourceCoords(clientX, clientY) {
    const rect = containerRef.current.getBoundingClientRect();
    const x = (clientX - rect.left) / scale;
    const y = (clientY - rect.top) / scale;
    return {
      x: Math.max(0, Math.min(workingCanvas.width, x)),
      y: Math.max(0, Math.min(workingCanvas.height, y)),
    };
  }

  function handlePointerDown(e) {
    if (!editable) return;
    const p = toSourceCoords(e.clientX, e.clientY);
    setDragState({ startX: p.x, startY: p.y });
    onRoiChange?.({ x: p.x, y: p.y, w: 0, h: 0 });
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e) {
    if (!editable || !dragState) return;
    const p = toSourceCoords(e.clientX, e.clientY);
    const x = Math.min(dragState.startX, p.x);
    const y = Math.min(dragState.startY, p.y);
    const w = Math.abs(p.x - dragState.startX);
    const h = Math.abs(p.y - dragState.startY);
    onRoiChange?.({ x, y, w, h });
  }

  function handlePointerUp() {
    setDragState(null);
  }

  const roiStyle = roi
    ? {
        left: roi.x * scale,
        top: roi.y * scale,
        width: roi.w * scale,
        height: roi.h * scale,
      }
    : null;

  const roiTooSmall = editable && roi && roi.w > 0 && roi.w < 6;

  return (
    <div>
      <div
        ref={containerRef}
        className="relative w-full select-none rounded-md overflow-hidden touch-none"
        style={{
          touchAction: editable ? 'none' : 'auto',
          cursor: editable ? 'crosshair' : 'default',
          background: '#000',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <img
          src={dataUrl}
          alt="Uploaded badge"
          style={{ width: displaySize.w || '100%', display: 'block' }}
          draggable={false}
        />

        {editable && !roi?.w && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-6">
            <span
              className="text-[11.5px] px-3 py-1.5 rounded-full font-medium text-center"
              style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}
            >
              Drag over the sensing patch to select it
            </span>
          </div>
        )}

        {roiStyle && (
          <div
            className="absolute border-2 pointer-events-none"
            style={{
              ...roiStyle,
              borderColor: roiTooSmall ? 'var(--high)' : 'var(--accent)',
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
            }}
          >
            <span
              className="absolute -top-6 left-0 text-[10.5px] px-1.5 py-0.5 rounded font-mono-data whitespace-nowrap"
              style={{ background: roiTooSmall ? 'var(--high)' : 'var(--accent)', color: '#062825' }}
            >
              {label}
            </span>
            {editable && roi.w > 8 && roi.h > 8 && (
              <span
                className="absolute bottom-1 right-1 text-[9.5px] px-1 py-0.5 rounded font-mono-data whitespace-nowrap"
                style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}
              >
                {Math.round(roi.w)}×{Math.round(roi.h)}px
              </span>
            )}
          </div>
        )}
      </div>

      {editable && (
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px]" style={{ color: roiTooSmall ? 'var(--high)' : 'var(--text-faint)' }}>
            {roiTooSmall
              ? 'Selection too small — drag a larger rectangle.'
              : roi?.w
              ? `Selected ${Math.round(roi.w)}×${Math.round(roi.h)}px`
              : 'No selection yet'}
          </span>
          {roi?.w > 0 && (
            <button
              type="button"
              onClick={() => onRoiChange?.({ x: roi.x, y: roi.y, w: 0, h: 0 })}
              className="text-[11px] font-medium"
              style={{ color: 'var(--text-faint)' }}
            >
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}
