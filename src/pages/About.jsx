import { Card, Eyebrow } from '../components/Primitives';

const PIPELINE_STEPS = [
  ['Preprocessing', 'Image is resized to a normalized working resolution while preserving aspect ratio.'],
  ['Quality check', 'Brightness, contrast, saturation and glare are measured before any color decision is made.'],
  ['Badge detection', 'Background is estimated from the image border; pixels that differ perceptually from it are grouped into connected regions to locate the badge.'],
  ['Sensing ROI', 'An inset region within the badge avoids the bezel/QR/border; if detection is uncertain, you select the region manually.'],
  ['Color extraction', 'Border pixels, highlights and shadows are discarded; the remaining pixels are combined via a trimmed median for a robust representative color.'],
  ['Color space conversion', 'The representative color is converted to HSV and CIE Lab.'],
  ['Calibration comparison', 'CIEDE2000 perceptual distance is computed against each calibration reference; the nearest match is selected.'],
  ['Confidence scoring', 'Combines color closeness, separation from the next-nearest reference, image quality, ROI uniformity, and detection confidence.'],
  ['Result', 'Exposure category and risk are reported only when confidence clears the threshold — otherwise the result is marked uncertain.'],
];

export default function About() {
  return (
    <div className="max-w-3xl mx-auto px-5 md:px-8 py-8">
      <Eyebrow>Technical Overview</Eyebrow>
      <h1 className="text-[20px] font-semibold mt-1.5 mb-2">About this prototype</h1>
      <p className="text-[13.5px] mb-6" style={{ color: 'var(--text-dim)' }}>
        A frontend-only demonstration of a passive colorimetric H₂S exposure-dosimeter analyzer,
        built for the SIH 2026 problem statement on AI-based quantitative reading of colorimetric
        badges.
      </p>

      <Card className="p-5 mb-5">
        <div className="text-[13px] font-semibold mb-3">How the analysis pipeline works</div>
        <ol className="space-y-3">
          {PIPELINE_STEPS.map(([title, desc], i) => (
            <li key={title} className="flex gap-3">
              <span className="text-[11px] font-mono-data w-5 shrink-0 pt-0.5" style={{ color: 'var(--accent)' }}>{i + 1}</span>
              <div>
                <div className="text-[12.5px] font-medium">{title}</div>
                <div className="text-[12px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{desc}</div>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card className="p-5 mb-5">
        <div className="text-[13px] font-semibold mb-2">Scientific limitations</div>
        <ul className="text-[12.5px] space-y-1.5" style={{ color: 'var(--text-dim)' }}>
          <li>· Reports an <strong>estimated exposure category</strong> against a color scale — not a certified ppm concentration.</li>
          <li>· Default calibration reference colors are illustrative starting points and should be replaced with colors measured from real badges at known exposure levels.</li>
          <li>· Lighting conditions still affect accuracy; the quality checks reduce but cannot eliminate this.</li>
        </ul>
      </Card>

      <div className="text-[12px] leading-relaxed rounded-lg border p-4" style={{ borderColor: 'var(--border)', color: 'var(--text-faint)' }}>
        This prototype provides a color-based exposure indication for demonstration purposes and
        is not a replacement for certified H₂S gas detection equipment.
      </div>
    </div>
  );
}
