import { useState, useCallback, useRef } from 'react';
import UploadDropzone from '../components/UploadDropzone';
import ImageRoiOverlay from '../components/ImageRoiOverlay';
import CalibrationScale from '../components/CalibrationScale';
import DebugPanel from '../components/DebugPanel';
import DemoBadgeGallery from '../components/DemoBadgeGallery';
import { Card, ColorSwatch, RiskPill, DataRow, Button, Eyebrow, Divider, StatTile, QualityBadge } from '../components/Primitives';
import { loadImageFromFile, loadImageFromUrl } from '../utils/canvasUtils';
import { runAnalysis } from '../vision/pipeline';
import { validateBadgeRegions } from '../vision/badgeValidation';
import { pushHistoryEntry } from '../calibration/calibrationStore';
import { fmt, pct } from '../utils/format';
import { buildAnalysisReport, downloadCsv, downloadJson, printReport } from '../utils/report';

const STAGES = [
  'Validating badge regions (QR + Reference + Strip)',
  'Preprocessing image',
  'Checking image quality',
  'Scanning QR / identifying worker',
  'Detecting badge / sensing region',
  'Extracting color',
  'Comparing to calibration',
];

export default function Analyze() {
  const [img, setImg] = useState(null);
  const [imgSource, setImgSource] = useState(null); // 'upload' | demo label, for header context
  const [result, setResult] = useState(null);
  const [manualRoi, setManualRoi] = useState(null);
  const [manualMode, setManualMode] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState(0);
  const [analyzingId, setAnalyzingId] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [manualBadgeId, setManualBadgeId] = useState('');
  const [reportOpen, setReportOpen] = useState(true);
  const imgElRef = useRef(null);

  const analyze = useCallback((imageEl, roiOverride) => {
    setProcessing(true);
    setProcessingStage(0);
    setLoadError(null);

    // Lightweight staged progress so the UI communicates real pipeline work
    // rather than a bare spinner — timings are cosmetic, the analysis itself
    // runs synchronously in one pass below.
    const stageTimer = setInterval(() => {
      setProcessingStage((s) => Math.min(STAGES.length - 1, s + 1));
    }, 110);

    // Defer to next tick so the "processing" UI actually paints before the
    // (synchronous, CPU-bound) pipeline runs.
    setTimeout(() => {
      try {
        // PRE-FLIGHT GATE: Three-Region Validation
        // A valid badge must contain: QR code, Reference color patch, and H2S sensing strip.
        // If any region is missing, reject immediately before the H2S analysis pipeline runs.
        let refPatchResult = null;
        if (!roiOverride) {
          const validation = validateBadgeRegions(imageEl);
          if (!validation.isValid) {
            clearInterval(stageTimer);
            setResult({
              status: 'rejected',
              validation,
              message: validation.rejectionReason,
              missingRegions: validation.missingRegions,
              workingCanvas: validation.workingCanvas,
            });
            setProcessing(false);
            setAnalyzingId(null);
            return;
          }
          refPatchResult = validation.regions?.referencePatch?.result || null;
        }

        const res = runAnalysis(imageEl, {
          manualRoi: roiOverride || null,
          referencePatch: refPatchResult,
        });
        console.log('=== QR RESULT RECEIVED BY ANALYZE ===', res?.qr);
        console.log('=== QR RAW TEXT ===', res?.qr?.data);
        console.log('=== PARSED QR OBJECT ===', res?.qr?.metadata);
        console.log('=== FINAL ANALYSIS RESULT QR ===', res?.qr);
        clearInterval(stageTimer);
        setResult(res);
        setProcessing(false);
        setAnalyzingId(null);
        if (res.status === 'needs_manual_roi') {
          setManualMode(true);
          setManualRoi(res.suggestedRoi);
        } else {
          setManualMode(false);
          if (res.status === 'complete') {
            const badgeMetadata = res.qr?.metadata || res.qr?.badge || {};
            const resolvedBadgeId = badgeMetadata.badgeId || manualBadgeId.trim() || '';
            pushHistoryEntry({
              timestamp: res.timestamp,
              badgeId: resolvedBadgeId || 'Not available',
              workerId: badgeMetadata.workerId || null,
              workerName: badgeMetadata.workerName || null,
              department: badgeMetadata.department || null,
              shift: badgeMetadata.shift || null,
              site: badgeMetadata.site || null,
              batchId: badgeMetadata.batchId || badgeMetadata.batch || null,
              issueDate: badgeMetadata.issueDate || null,
              expiryDate: badgeMetadata.expiryDate || null,
              category: res.classification.nearest.exposureCategory,
              risk: res.classification.nearest.risk,
              confidence: res.classification.confidence,
              estimatedDosePpmH: res.classification.estimatedDosePpmH,
              doseIntervalPpmH: res.classification.doseIntervalPpmH,
              estimatedExposurePpm8h: res.classification.estimatedExposurePpm8h,
              exposureIntervalPpm8h: res.classification.exposureIntervalPpm8h,
              deltaE: res.classification.nearestDeltaE,
              color: res.extracted.rgb,
              initialColor: res.classification.nearest.color,
              calibration: res.classification.nearest.label,
              imageQuality: res.globalQuality.label,
              qrStatus: res.qr?.found ? 'Detected' : 'Not detected',
              warnings: [
                ...(res.qualityIssues || []),
                ...(res.classification.isUncertain ? ['Classification is uncertain'] : []),
              ],
              thumbnail: res.roiCanvas.toDataURL('image/png'),
            });
          }
        }
      } catch (err) {
        clearInterval(stageTimer);
        setProcessing(false);
        setAnalyzingId(null);
        setResult({ status: 'error', message: err?.message || 'The analysis pipeline hit an unexpected error.' });
      }
    }, 30);
  }, [manualBadgeId]);

  async function handleFile(file) {
    try {
      const { img: imageEl, url } = await loadImageFromFile(file);
      setImg({ el: imageEl, url });
      setImgSource('Uploaded photo');
      imgElRef.current = imageEl;
      setManualRoi(null);
      setManualMode(false);
      analyze(imageEl);
    } catch {
      setLoadError('Could not read that image file. Please try a different photo.');
    }
  }

  async function handleDemoClick(demo) {
    setAnalyzingId(demo.id);
    try {
      const { img: imageEl, url } = await loadImageFromUrl(demo.dataUrl);
      setImg({ el: imageEl, url });
      setImgSource(`Demo badge · ${demo.label}`);
      imgElRef.current = imageEl;
      setManualRoi(null);
      setManualMode(false);
      analyze(imageEl);
    } catch {
      setAnalyzingId(null);
      setLoadError('Could not load that demo badge. Please try another one.');
    }
  }

  function confirmManualRoi() {
    if (!manualRoi || manualRoi.w < 6 || manualRoi.h < 6) return;
    analyze(imgElRef.current, manualRoi);
  }

  function retry() {
    if (imgElRef.current) analyze(imgElRef.current, manualMode ? manualRoi : null);
  }

  function reset() {
    setImg(null);
    setImgSource(null);
    setResult(null);
    setManualRoi(null);
    setManualMode(false);
    setLoadError(null);
    setManualBadgeId('');
    setReportOpen(false);
  }

  const showResults = result && result.status === 'complete';
  const showManualRoi = result && result.status === 'needs_manual_roi';
  const showError = result && (result.status === 'error' || result.status === 'reference_failed' || result.status === 'invalid_expiry' || result.status === 'calibration_unavailable');
  const showRejected = result && result.status === 'rejected';
  const showExpired = result && result.status === 'expired';
  const cls = showResults ? result.classification : null;
  const report = showResults ? buildAnalysisReport(result, result.qr?.metadata?.badgeId || manualBadgeId.trim()) : null;
  const qrMetadata = result?.qr?.metadata || result?.qr?.badge || {};

  return (
    <div className="max-w-6xl mx-auto px-5 md:px-8 py-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <Eyebrow>Analysis Console</Eyebrow>
          <h1 className="text-[21px] font-semibold mt-1.5" style={{ color: 'var(--text)' }}>Analyze Badge</h1>
          <p className="text-[13px] mt-1 max-w-md" style={{ color: 'var(--text-faint)' }}>
            Upload a photograph of the dosimeter wristband, or try a demo badge, to run the full
            detection → extraction → calibration pipeline.
          </p>
        </div>
        {img && (
          <Button variant="secondary" onClick={reset} className="shrink-0">
            <BackIcon />
            Analyze another badge
          </Button>
        )}
      </div>

      {!img && (
        <div className="space-y-8">
          <Card className="p-4">
            <label className="block text-[12px] font-medium mb-1.5" htmlFor="badge-id">Badge ID (optional)</label>
            <input
              id="badge-id"
              value={manualBadgeId}
              onChange={(e) => setManualBadgeId(e.target.value)}
              placeholder="Enter ID if QR is unavailable"
              className="w-full rounded-md border px-3 py-2 text-[13px] outline-none"
              style={{ background: 'var(--panel-sunken)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
          </Card>
          <UploadDropzone onFile={handleFile} />
          {loadError && (
            <div
              className="rounded-md border px-3.5 py-2.5 text-[12.5px]"
              style={{ borderColor: 'var(--high)', background: 'var(--high-soft)', color: 'var(--high)' }}
            >
              {loadError}
            </div>
          )}

          <div>
            <Divider className="mb-6" />
            <DemoBadgeGallery onAnalyze={handleDemoClick} analyzingId={analyzingId} />
          </div>
        </div>
      )}

      {img && processing && (
        <Card className="p-6 animate-fade-up">
          <ProcessingIndicator stage={processingStage} sourceLabel={imgSource} />
        </Card>
      )}

      {img && !processing && showError && (
        <Card className="p-6 animate-fade-up" style={{ borderColor: 'var(--critical)' }}>
          <div className="flex items-start gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'var(--critical-soft)', color: 'var(--critical)' }}
            >
              <WarnIcon />
            </div>
            <div className="flex-1">
              <div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>
                {result.status === 'calibration_unavailable' ? 'Calibration Unavailable' : 'Analysis failed'}
              </div>
              <p className="text-[12.5px] mt-1 mb-4" style={{ color: 'var(--text-dim)' }}>{result.message}</p>
              <div className="flex gap-2">
                <Button variant="primary" onClick={retry}>Try again</Button>
                <Button variant="secondary" onClick={reset}>Upload a different photo</Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {img && !processing && showExpired && (
        <Card className="p-6 animate-fade-up" style={{ borderColor: 'var(--critical)' }}>
          <div className="flex items-start gap-3.5">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'var(--critical-soft)', color: 'var(--critical)' }}
            >
              <WarnIcon size={20} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>
                  Badge Expired
                </div>
                <span
                  className="text-[10.5px] uppercase font-mono-data px-2 py-0.5 rounded font-semibold"
                  style={{ background: 'var(--critical-soft)', color: 'var(--critical)' }}
                >
                  Reliability Gate
                </span>
              </div>
              <p className="text-[13px] mt-1.5 mb-3 font-medium" style={{ color: 'var(--critical)' }}>
                Badge expired — exposure analysis blocked.
              </p>

              {result.qr?.metadata && (
                <div className="p-3.5 rounded-lg border mb-4" style={{ borderColor: 'var(--border)', background: 'var(--panel-sunken)' }}>
                  <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-faint)' }}>
                    Badge Expiry Details
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
                    <div>
                      <span className="text-[11px] block" style={{ color: 'var(--text-faint)' }}>Badge ID</span>
                      <span className="font-mono-data font-medium">{result.qr.metadata.badgeId || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-[11px] block" style={{ color: 'var(--text-faint)' }}>Worker</span>
                      <span className="font-medium">{result.qr.metadata.workerName || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-[11px] block" style={{ color: 'var(--text-faint)' }}>Expiry Date</span>
                      <span className="font-mono-data font-semibold" style={{ color: 'var(--critical)' }}>
                        {result.expiryVerification?.expiryDate || result.qr.metadata.expiryDate || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] block" style={{ color: 'var(--text-faint)' }}>Status</span>
                      <span className="font-semibold" style={{ color: 'var(--critical)' }}>EXPIRED</span>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-[12px] mb-4 leading-relaxed" style={{ color: 'var(--text-faint)' }}>
                Exposure analysis is automatically blocked for expired dosimeters to prevent inaccurate safety measurements. Please replace with an active, unexpired dosimeter badge.
              </p>

              <div className="flex gap-2">
                <Button variant="primary" onClick={reset}>Upload a different photo</Button>
                <Button variant="secondary" onClick={retry}>Retry scan</Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {img && !processing && showRejected && (
        <Card className="p-6 animate-fade-up" style={{ borderColor: 'var(--critical)' }}>
          <div className="flex items-start gap-3.5">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'var(--critical-soft)', color: 'var(--critical)' }}
            >
              <WarnIcon size={20} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>
                  Badge Validation Rejected
                </div>
                <span
                  className="text-[10.5px] uppercase font-mono-data px-2 py-0.5 rounded font-semibold"
                  style={{ background: 'var(--critical-soft)', color: 'var(--critical)' }}
                >
                  Pre-Flight Gate
                </span>
              </div>
              <p className="text-[13px] mt-1.5 mb-4 font-medium" style={{ color: 'var(--critical)' }}>
                {result.message}
              </p>

              <div className="p-3.5 rounded-lg border mb-4" style={{ borderColor: 'var(--border)', background: 'var(--panel-sunken)' }}>
                <div className="text-[11px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: 'var(--text-faint)' }}>
                  Three-Region Pre-Flight Checklist
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <RegionStatusItem
                    label="1. QR Code"
                    found={result.validation?.regions?.qr?.found}
                    description="Worker & badge metadata"
                  />
                  <RegionStatusItem
                    label="2. Reference Color Patch"
                    found={result.validation?.regions?.referencePatch?.found}
                    description="Neutral calibration standard"
                  />
                  <RegionStatusItem
                    label="3. H₂S Sensing Strip"
                    found={result.validation?.regions?.sensingStrip?.found}
                    description="Chemical exposure medium"
                  />
                </div>
              </div>

              <p className="text-[12px] mb-4 leading-relaxed" style={{ color: 'var(--text-faint)' }}>
                A valid dosimeter image must contain all three required regions. The H₂S analysis pipeline was stopped before color extraction or exposure calculation to prevent erroneous readings.
              </p>

              <div className="flex gap-2">
                <Button variant="primary" onClick={reset}>Upload a different photo</Button>
                <Button variant="secondary" onClick={retry}>Retry scan</Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {img && !processing && (showResults || showManualRoi) && (
        <StatusPipeline result={result} />
      )}

      {img && !processing && (showResults || showManualRoi) && (
        <div className="grid lg:grid-cols-5 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-3 animate-fade-up">
              <div className="flex items-center justify-between px-1 pb-2">
                <span className="text-[11px] font-medium" style={{ color: 'var(--text-faint)' }}>{imgSource}</span>
              </div>
              <ImageRoiOverlay
                workingCanvas={result.workingCanvas}
                roi={manualMode ? manualRoi : result.sensingRoi}
                editable={manualMode}
                onRoiChange={setManualRoi}
                label={manualMode ? 'Select Sensing Area' : 'Analyzed Region'}
              />
            </Card>

            <Card className="p-4 animate-fade-up">
              <div className="text-[12.5px] font-semibold mb-2">Sensor (Color Patch) Analysis</div>
              <DataRow label="Sensor region" value={showResults ? 'Detected ✓' : 'Manual selection required'} />
              {showResults && <>
                <DataRow label="Detection confidence" value={pct(result.detection.confidence)} />
                <DataRow label="ROI quality" value={`${result.roiQuality.label} (${pct(result.roiQuality.score)})`} />
                <DataRow label="ROI uniformity" value={pct(result.extracted.uniformity)} />
                <DataRow label="Samples used" value={`${result.extracted.sampleCount} / ${result.extracted.totalCandidates}`} />
              </>}
            </Card>

            {result.qr && (
              <Card className="p-4 animate-fade-up">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="text-[12.5px] font-semibold">Worker & Badge Identification</div>
                  {result.qr.found && (
                    <span
                      className="text-[11px] font-medium px-2 py-0.5 rounded"
                      style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }}
                    >
                      ✓ QR Verified
                    </span>
                  )}
                </div>

                {result.qr.found ? (
                  <div className="space-y-0.5">
                    <DataRow
                      label="Worker"
                      value={qrMetadata.workerName ? `${qrMetadata.workerName} (${qrMetadata.workerId || ''})` : (qrMetadata.workerId || 'Not available')}
                    />
                    <DataRow
                      label="Department / Shift"
                      value={`${qrMetadata.department || 'Operations'} · ${qrMetadata.shift || 'General'}`}
                    />
                    <DataRow
                      label="Location / Site"
                      value={qrMetadata.site || 'Plant Unit'}
                    />
                    <DataRow
                      label="Badge ID"
                      value={qrMetadata.badgeId || 'Not available'}
                    />
                    <DataRow
                      label="Batch ID"
                      value={qrMetadata.batchId || qrMetadata.batch || 'Not available'}
                    />
                    <DataRow
                      label="Validity"
                      value={`${formatQrDate(qrMetadata.issueDate)} → ${formatQrDate(qrMetadata.expiryDate)}`}
                    />
                    {result.expiryVerification && (
                      <DataRow
                        label="Badge reliability"
                        value={result.expiryVerification.valid ? 'VALID (ACTIVE) ✓' : 'EXPIRED ✗'}
                      />
                    )}

                    <details className="mt-2.5 pt-2 border-t text-[11px] cursor-pointer" style={{ borderColor: 'var(--border-soft)', color: 'var(--text-faint)' }}>
                      <summary className="hover:underline py-0.5 outline-none select-none">
                        Raw QR payload
                      </summary>
                      <pre
                        className="mt-1.5 p-2 rounded text-[11px] font-mono-data overflow-x-auto whitespace-pre-wrap break-all"
                        style={{ background: 'var(--panel-sunken)', color: 'var(--text-dim)' }}
                      >
                        {(() => {
                          try {
                            const raw = result.qr.rawContent || result.qr.data;
                            return typeof raw === 'object' ? JSON.stringify(raw, null, 2) : JSON.stringify(JSON.parse(raw), null, 2);
                          } catch {
                            return result.qr.rawContent || result.qr.data || 'Not available';
                          }
                        })()}
                      </pre>
                    </details>
                  </div>
                ) : (
                  <div className="text-[12.5px]" style={{ color: 'var(--text-faint)' }}>
                    QR not detected — continuing with visual analysis.
                  </div>
                )}
              </Card>
            )}

            {manualMode && (
              <Card className="p-4 animate-fade-up" style={{ borderColor: 'var(--accent-border)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <TargetIcon />
                  <div className="text-[13px] font-medium" style={{ color: 'var(--text)' }}>
                    Sensor region could not be detected automatically.
                  </div>
                </div>
                <p className="text-[12.5px] mb-3 leading-relaxed" style={{ color: 'var(--text-faint)' }}>
                  Drag a rectangle over the colorimetric sensing patch above, avoiding the badge's
                  border/bezel, QR code, and any glare. The same analysis algorithm runs on your
                  selection — nothing changes except which pixels feed it.
                </p>
                <Button
                  variant="primary"
                  onClick={confirmManualRoi}
                  disabled={!manualRoi || manualRoi.w < 6 || manualRoi.h < 6}
                >
                  Select Sensor Region Manually
                </Button>
              </Card>
            )}
          </div>

          <div className="lg:col-span-3 space-y-4">
            {showResults && (
              <Card className="p-5 animate-fade-up" style={{ borderColor: 'var(--accent-border)' }}>
                <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--accent)' }}>Exposure Result Summary</div>
                <div className="flex items-start justify-between gap-3 mt-2">
                  <div>
                    <div className="text-[24px] font-semibold" style={{ color: 'var(--text)' }}>{cls.nearest.exposureCategory}</div>
                    <div className="text-[12px] mt-1" style={{ color: 'var(--text-faint)' }}>Existing calibration result</div>
                  </div>
                  <RiskPill risk={cls.nearest.risk} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-4" style={{ borderTop: '1px solid var(--border-soft)' }}>
                  <StatTile label="8-hour exposure" value={`${cls.estimatedExposurePpm8h} ppm/8h`} valueColor="var(--accent)" />
                  <StatTile label="Confidence" value={pct(cls.confidence)} />
                  <StatTile label="Image quality" value={`${result.globalQuality.label} (${pct(result.globalQuality.score)})`} />
                  <StatTile label="Saturation" value={result.extracted.hsv.s > 0.05 ? 'Not saturated' : 'Low'} />
                  <StatTile label="Badge validity" value="Valid" />
                </div>
              </Card>
            )}
            {showManualRoi && (
              <Card className="p-6 animate-fade-up hidden lg:block">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center mb-3"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                >
                  <TargetIcon size={20} />
                </div>
                <div className="text-[14px] font-semibold mb-1.5" style={{ color: 'var(--text)' }}>
                  Waiting on the sensing-area selection
                </div>
                <p className="text-[12.5px] leading-relaxed mb-4" style={{ color: 'var(--text-faint)' }}>
                  Once you drag a box over the colored sensing patch on the left and click{' '}
                  <strong style={{ color: 'var(--text-dim)' }}>Analyze selected region</strong>, this
                  panel will show the detected color, the closest calibration reference, ΔE,
                  exposure category, risk level, confidence, and image quality — exactly like an
                  automatic detection.
                </p>
                <ol className="text-[12px] space-y-2" style={{ color: 'var(--text-faint)' }}>
                  <li className="flex gap-2"><span style={{ color: 'var(--accent)' }}>1.</span> Drag a rectangle over just the colorimetric patch.</li>
                  <li className="flex gap-2"><span style={{ color: 'var(--accent)' }}>2.</span> Avoid the badge border, QR code, and any glare.</li>
                  <li className="flex gap-2"><span style={{ color: 'var(--accent)' }}>3.</span> Click "Analyze selected region" to run the pipeline.</li>
                </ol>
              </Card>
            )}
            {showResults && (
              <>
                {cls.isUncertain ? (
                  <Card className="p-5 animate-fade-up" style={{ borderColor: 'var(--moderate)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span style={{ color: 'var(--moderate)' }}><WarnIcon size={16} /></span>
                      <div className="text-[15px] font-semibold" style={{ color: 'var(--moderate)' }}>Uncertain result</div>
                    </div>
                    <p className="text-[13px] mb-3 leading-relaxed" style={{ color: 'var(--text-dim)' }}>
                      The detected color sits between calibration references, or region/lighting
                      quality is too low to classify reliably. Please capture the sensing area
                      again under uniform lighting, or refine the region manually.
                    </p>
                    <Button variant="secondary" onClick={() => { setManualMode(true); setManualRoi(result.sensingRoi); }}>
                      <TargetIcon size={13} />
                      Select sensing area manually
                    </Button>
                    <Divider className="mt-4 pt-4" />
                    <DataRow label="Confidence (below threshold)" value={pct(cls.confidence)} />
                    <DataRow label="Closest reference" value={`${cls.nearest.label} (ΔE ${fmt(cls.nearestDeltaE)})`} />
                  </Card>
                ) : (
                  <Card className="p-5 animate-fade-up">
                    <div className="flex items-start justify-between gap-3 mb-5">
                      <div>
                        <Eyebrow color={riskEyebrowColor(cls.nearest.risk)}>Estimated Exposure</Eyebrow>
                        <div className="text-[24px] font-semibold mt-1.5" style={{ color: 'var(--text)' }}>{cls.nearest.exposureCategory}</div>
                        <div className="text-[15px] font-mono-data mt-1" style={{ color: 'var(--accent)' }}>
                          {cls.estimatedExposurePpm8h} ppm/8h estimated exposure
                        </div>
                      </div>
                      <RiskPill risk={cls.nearest.risk} />
                    </div>

                    <div className="flex items-center gap-5 mb-5 flex-wrap">
                      <ColorSwatch rgb={result.extracted.rgb} label="Detected" />
                      <ArrowIcon />
                      <ColorSwatch rgb={cls.nearest.color} label="Reference" />
                      <div className="ml-1">
                        <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Color difference</div>
                        <div className="text-[17px] font-mono-data font-semibold" style={{ color: 'var(--text)' }}>ΔE {fmt(cls.nearestDeltaE)}</div>
                        <div className="text-[10.5px] mt-0.5" style={{ color: 'var(--text-faint)' }}>CIEDE2000, lower = closer match</div>
                      </div>
                    </div>

                    <CalibrationScale calibration={result.calibration} classification={cls} />

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-5 pt-5" style={{ borderTop: '1px solid var(--border-soft)' }}>
                      <StatTile label="Exposure interval" value={`${cls.exposureIntervalPpm8h[0]}–${cls.exposureIntervalPpm8h[1]} ppm/8h`} />
                      <StatTile label="Confidence" value={pct(cls.confidence)} valueColor={cls.confidence > 0.7 ? 'var(--safe)' : 'var(--moderate)'} />
                      <StatTile label="Image quality" value={<QualityBadge label={result.globalQuality.label} />} />
                      <StatTile label="Detection" value="Badge ✓" valueColor="var(--safe)" />
                      <StatTile label="Sensing region" value="Detected ✓" valueColor="var(--safe)" />
                    </div>

                    <p className="text-[12.5px] mt-5 pt-4 leading-relaxed" style={{ borderTop: '1px solid var(--border-soft)', color: 'var(--text-dim)' }}>
                      {cls.nearest.description} The sensing region's extracted color is closest to the{' '}
                      <strong style={{ color: 'var(--text)' }}>{cls.nearest.label}</strong> calibration
                      reference (ΔE {fmt(cls.nearestDeltaE)}), next closest to{' '}
                      {cls.secondNearest.label} (ΔE {fmt(cls.secondNearestDeltaE)}).
                    </p>
                    <p className="text-[11px] mt-3" style={{ color: 'var(--text-faint)' }}>
                      {cls.algorithm} · {cls.modelVersion} · synthetic prototype estimate, not validated dosimetry
                    </p>
                  </Card>
                )}

                <DebugPanel result={result} />

                {report && (
                  <Card className="p-4 animate-fade-up">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div>
                        <div className="text-[13px] font-semibold">View Full Analysis Report</div>
                        <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>Same analysis result as Analysis Details</div>
                      </div>
                      <div className="flex gap-2 flex-wrap justify-end">
                        <Button size="sm" variant="accentGhost" onClick={() => downloadJson(report)}>JSON</Button>
                        <Button size="sm" variant="secondary" onClick={() => downloadCsv(report)}>CSV</Button>
                        <Button size="sm" variant="secondary" onClick={() => printReport(report)}>Print / PDF</Button>
                      </div>
                    </div>
                    <Button size="sm" variant="accentGhost" onClick={() => setReportOpen((open) => !open)}>
                      {reportOpen ? 'Hide report' : 'Open complete report'}
                    </Button>
                    {reportOpen && <>
                    <ReportSection title="Worker & Badge" data={report.workerAndBadge} />
                    <ReportSection title="Analysis Summary" data={report.summary} />
                    <ReportSection title="Image Quality" data={report.imageQuality} />
                    <ReportSection title="Detected ROI" data={report.roi} />
                    <ReportSection title="Extracted Color" data={report.extractedColor} />
                    <ReportSection title="Calibration / ΔE2000" data={report.calibration} />
                    <ReportSection title="Confidence Breakdown" data={report.confidenceBreakdown} />
                    <ReportSection title="Timestamp & System" data={report.timestampAndSystem} />
                    <ReportSection title="Warnings" data={{ items: report.warnings.length ? report.warnings.join('; ') : 'None' }} />
                    <ReportSection title="Interpretation" data={{ result: report.interpretation }} />
                    </>}
                  </Card>
                )}

                <p className="text-[11.5px] leading-relaxed px-1" style={{ color: 'var(--text-faint)' }}>
                  This prototype provides a color-based exposure indication for demonstration
                  purposes and is not a replacement for certified H₂S gas detection equipment.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReportSection({ title, data }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-t first:border-t-0" style={{ borderColor: 'var(--border-soft)' }}>
      <button
        className="w-full flex items-center justify-between py-2.5 text-left text-[12px] font-semibold"
        style={{ color: 'var(--text)' }}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {title}
        <span style={{ color: 'var(--text-faint)' }}>{open ? '−' : '+'}</span>
      </button>
      {open && <div className="pb-2">{Object.entries(data).map(([key, value]) => (
        <DataRow key={key} label={key.replaceAll(/([A-Z])/g, ' $1')} value={formatReportValue(value)} mono={false} />
      ))}</div>}
    </div>
  );
}

function StatusPipeline({ result }) {
  const qrDone = result.qr?.found;
  const sensorDone = result.status === 'complete';
  const stages = [
    ['Image Uploaded', true, 'DONE'],
    ['QR Scanned', Boolean(result.qr), qrDone ? 'VALID' : 'NOT DETECTED'],
    ['Worker Identified', qrDone && Boolean(result.qr.metadata?.workerId), qrDone ? 'DONE' : 'UNAVAILABLE'],
    ['Sensor Analyzed', sensorDone, sensorDone ? 'DONE' : 'MANUAL SELECTION REQUIRED'],
    ['Report Generated', sensorDone, sensorDone ? 'COMPLETE' : 'WAITING'],
  ];
  return (
    <Card className="p-4 mb-5 animate-fade-up">
      <div className="text-[11px] uppercase tracking-wide mb-3" style={{ color: 'var(--accent)' }}>Analysis Status Pipeline</div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {stages.map(([label, done, state]) => (
          <div key={label} className="rounded-md border px-3 py-2" style={{ borderColor: done ? 'var(--accent-border)' : 'var(--border)', background: done ? 'var(--accent-soft)' : 'var(--panel-sunken)' }}>
            <div className="text-[12px] font-medium" style={{ color: 'var(--text)' }}>{done ? '✓ ' : '○ '}{label}</div>
            <div className="text-[10px] mt-1 font-mono-data" style={{ color: done ? 'var(--accent)' : 'var(--text-faint)' }}>{state}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function formatReportValue(value) {
  if (value == null) return 'Not available';
  if (typeof value === 'number') return value < 1 ? pct(value) : fmt(value, 2);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatQrDate(value) {
  if (!value) return 'Not available';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function riskEyebrowColor(risk) {
  const map = {
    SAFE: 'var(--safe)',
    'LOW RISK': 'var(--low)',
    'MODERATE RISK': 'var(--moderate)',
    'HIGH RISK': 'var(--high)',
    'CRITICAL RISK': 'var(--critical)',
  };
  return map[risk] || 'var(--accent)';
}

function ProcessingIndicator({ stage, sourceLabel }) {
  return (
    <div className="flex flex-col items-center py-8">
      <div className="relative w-12 h-12 mb-5">
        <div className="absolute inset-0 rounded-full border-2" style={{ borderColor: 'var(--border)' }} />
        <div className="absolute inset-0 rounded-full border-2 animate-spin" style={{ borderColor: 'transparent', borderTopColor: 'var(--accent)' }} />
      </div>
      <div className="text-[13.5px] font-medium" style={{ color: 'var(--text)' }}>Running analysis pipeline…</div>
      {sourceLabel && (
        <div className="text-[11.5px] mt-1" style={{ color: 'var(--text-faint)' }}>{sourceLabel}</div>
      )}
      <div className="mt-5 space-y-2 w-full max-w-[280px]">
        {STAGES.map((s, i) => (
          <div key={s} className="flex items-center gap-2.5 text-[12px]" style={{ color: i <= stage ? 'var(--text-dim)' : 'var(--text-faint)' }}>
            <span
              className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 border transition-colors"
              style={{
                borderColor: i < stage ? 'var(--accent)' : i === stage ? 'var(--accent)' : 'var(--border)',
                background: i < stage ? 'var(--accent)' : 'transparent',
              }}
            >
              {i < stage && <CheckIcon />}
              {i === stage && <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} />}
            </span>
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#062825" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12H4M10 6l-6 6 6 6" />
    </svg>
  );
}
function TargetIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}
function WarnIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4M12 17h0" />
      <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L14.1 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}

function RegionStatusItem({ label, found, description }) {
  return (
    <div
      className="rounded-md border p-2.5 flex flex-col justify-between transition-colors"
      style={{
        borderColor: found ? 'rgba(52, 211, 153, 0.35)' : 'rgba(248, 113, 113, 0.35)',
        background: found ? 'rgba(52, 211, 153, 0.08)' : 'rgba(248, 113, 113, 0.08)',
      }}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[12px] font-medium" style={{ color: 'var(--text)' }}>{label}</span>
        <span
          className="text-[10.5px] font-mono-data font-semibold"
          style={{ color: found ? 'var(--safe)' : 'var(--critical)' }}
        >
          {found ? '✓ FOUND' : '✗ MISSING'}
        </span>
      </div>
      <span className="text-[10px] mt-1" style={{ color: 'var(--text-faint)' }}>{description}</span>
    </div>
  );
}
