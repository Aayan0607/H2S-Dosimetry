import { useRef, useState } from 'react';
import { Button } from './Primitives';

export default function UploadDropzone({ onFile }) {
  const inputRef = useRef(null);
  const cameraRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState(null);

  function validateAndEmit(file) {
    if (!file) return;
    const okTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const extension = file.name?.split('.').pop()?.toLowerCase();
    if (!okTypes.includes(file.type) && !['jpg', 'jpeg', 'png', 'webp'].includes(extension)) {
      setError('Please upload a JPG, PNG or WebP image.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError('That file is larger than 25 MB — please use a smaller photo.');
      return;
    }
    setError(null);
    onFile(file);
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          validateAndEmit(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        role="button"
        tabIndex={0}
        aria-label="Upload badge photo"
        className="relative rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-center px-6 py-14 cursor-pointer transition-all duration-150"
        style={{
          borderColor: dragging ? 'var(--accent)' : error ? 'var(--high)' : 'var(--border-strong)',
          background: dragging ? 'var(--accent-soft)' : 'var(--panel)',
          boxShadow: dragging ? '0 0 0 4px var(--accent-soft)' : 'none',
        }}
      >
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mb-3.5 transition-transform"
          style={{
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
            transform: dragging ? 'scale(1.08)' : 'scale(1)',
          }}
        >
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
            <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
          </svg>
        </div>
        <div className="text-[14.5px] font-medium" style={{ color: 'var(--text)' }}>
          {dragging ? 'Drop to upload' : 'Upload badge / wristband photo'}
        </div>
        <div className="text-[12.5px] mt-1" style={{ color: 'var(--text-faint)' }}>
          Drag and drop, or click to browse — JPG, PNG, WebP
        </div>
        <div className="text-[11px] mt-2.5 max-w-xs leading-relaxed" style={{ color: 'var(--text-faint)' }}>
          For best accuracy: even lighting, no flash glare, sensing patch fully in frame.
        </div>

        <div className="flex items-center gap-2.5 mt-5" onClick={(e) => e.stopPropagation()}>
          <Button type="button" variant="secondary" onClick={() => cameraRef.current?.click()}>
            <CameraIcon />
            Use Camera
          </Button>
        </div>
      </div>

      {error && (
        <div
          className="mt-2.5 flex items-center gap-2 rounded-md border px-3 py-2 text-[12.5px]"
          style={{ borderColor: 'var(--high)', background: 'var(--high-soft)', color: 'var(--high)' }}
        >
          <WarnIcon />
          {error}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => validateAndEmit(e.target.files?.[0])}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => validateAndEmit(e.target.files?.[0])}
      />
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13.5" r="3.2" />
    </svg>
  );
}
function WarnIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M12 9v4M12 17h0" />
      <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L14.1 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}
