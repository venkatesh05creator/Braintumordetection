import React from 'react';
import { GitCompare, Loader2 } from 'lucide-react';
import { getImageUrl } from '../../api/imageUrl';
import { burdenOf, fmtBurden, fmtPct, fmtSigned, fmtVol } from './formatters';

// Pure logic: compute delta stats between two scans
function computeDeltas(prev, cur) {
  const curB = burdenOf(cur);
  const prevB = burdenOf(prev);
  const bDelta = curB != null && prevB != null ? curB - prevB : null;
  const cDelta = cur?.final_confidence != null && prev?.final_confidence != null
    ? cur.final_confidence - prev.final_confidence : null;
  const days = cur && prev
    ? Math.max(0, Math.round((new Date(cur.created_at) - new Date(prev.created_at)) / 86400000)) : null;
  const findingChanged = prev?.final_classification && cur?.final_classification
    && prev.final_classification !== cur.final_classification;
  const vDelta = cur?.tumor_volume_cm3 != null && prev?.tumor_volume_cm3 != null
    ? cur.tumor_volume_cm3 - prev.tumor_volume_cm3 : null;
  return { bDelta, cDelta, days, findingChanged, vDelta };
}

function DeltaCards({ prev, cur }) {
  const { bDelta, cDelta, days, findingChanged, vDelta } = computeDeltas(prev, cur);
  const cards = [
    { title: 'Tumor Burden Δ', value: bDelta != null ? `${fmtSigned(bDelta)} pp` : '—', color: bDelta > 0 ? 'var(--accent-red)' : bDelta < 0 ? 'var(--accent-green)' : 'var(--text-muted)' },
    { title: 'Tumor Volume Δ', value: vDelta != null ? `${fmtSigned(vDelta)} cm³` : '—', color: vDelta > 0 ? 'var(--accent-red)' : vDelta < 0 ? 'var(--accent-green)' : 'var(--text-muted)' },
    { title: 'Tumor Probability Δ', value: cDelta != null ? `${fmtSigned(cDelta * 100)} pp` : '—', color: cDelta > 0 ? 'var(--accent-green)' : cDelta < 0 ? 'var(--accent-red)' : 'var(--text-muted)' },
    { title: 'Time Between', value: days != null ? `${days} day${days === 1 ? '' : 's'}` : '—', color: 'var(--accent-cyan)' },
    { title: 'Finding', value: findingChanged ? 'Changed' : (cur?.final_classification || '—'), color: findingChanged ? 'var(--accent-orange)' : 'var(--text-primary)' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginTop: '1.25rem' }}>
      {cards.map(card => (
        <div key={card.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '0.9rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>{card.title}</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'Space Grotesk', color: card.color }}>{card.value}</div>
        </div>
      ))}
    </div>
  );
}

function GrowthMapPanel({ growthMap, growthLoading, growthError, onToggle }) {
  return (
    <div style={{ marginTop: '1.25rem', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Tumor Growth Map</span>
        <button
          onClick={onToggle}
          className={`btn btn-sm ${growthMap ? 'btn-primary' : 'btn-secondary'}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          disabled={growthLoading}
        >
          {growthLoading ? <Loader2 className="animate-spin" size={13} /> : <GitCompare size={13} />}
          {growthMap ? 'Hide Growth Map' : 'Generate Growth Map'}
        </button>
      </div>

      {growthError && (
        <div className="alert alert-error" style={{ padding: '0.5rem 0.75rem' }}>{growthError}</div>
      )}

      {growthMap && (
        <>
          <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>
            <span><span style={{ color: '#ef4444', fontWeight: 700 }}>■</span> Expansion (current only)</span>
            <span><span style={{ color: '#10b981', fontWeight: 700 }}>■</span> Contraction (previous only)</span>
            <span><span style={{ color: '#f59e0b', fontWeight: 700 }}>■</span> Stable (both scans)</span>
          </div>
          <img
            src={getImageUrl(growthMap.image_url)}
            alt="Tumor Growth Map"
            style={{ width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 8, background: '#000' }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }}>
            {[
              { title: 'Expansion', value: `${(growthMap.expanded_px ?? 0).toLocaleString()} px`, color: '#f87171' },
              { title: 'Contraction', value: `${(growthMap.contracted_px ?? 0).toLocaleString()} px`, color: '#34d399' },
              { title: 'Stable', value: `${(growthMap.stable_px ?? 0).toLocaleString()} px`, color: '#fbbf24' },
              { title: 'Tumor-to-Brain Δ', value: growthMap.delta_pp != null ? `${fmtSigned(growthMap.delta_pp)} pp` : '—', color: growthMap.delta_pp > 0 ? '#f87171' : growthMap.delta_pp < 0 ? '#34d399' : 'var(--text-muted)' },
            ].map(card => (
              <div key={card.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '0.75rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>{card.title}</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'Space Grotesk', color: card.color }}>{card.value}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.75rem', lineHeight: 1.5 }}>
            Expansion = pixels with tumor in the current scan only; contraction = pixels with tumor in the previous scan only. Masks are single representative slices and are not registered — a change in slice position between studies can look like growth or shrinkage.
          </p>
        </>
      )}
    </div>
  );
}

function ScanCard({ scan, label, color }) {
  return (
    <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '1rem', boxShadow: 'inset 4px 4px 12px rgba(0,0,0,0.6), inset -2px -2px 8px rgba(255,255,255,0.03)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.68rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {scan ? new Date(scan.created_at).toLocaleDateString() : '—'}
        </span>
      </div>
      {scan?.original_image_url ? (
        <img src={getImageUrl(scan.original_image_url)} alt={`Scan ${label}`} style={{ width: '100%', maxHeight: 240, objectFit: 'contain', borderRadius: 8, background: '#000' }} />
      ) : (
        <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', border: '1px dashed var(--border-subtle)', borderRadius: 8 }}>No image</div>
      )}
      <div style={{ marginTop: '0.6rem', fontSize: '0.78rem', color: 'var(--text-primary)', textAlign: 'center' }}>
        <strong>{scan?.final_classification || 'Processing'}</strong> · Ratio {fmtBurden(burdenOf(scan))}
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          Tumor probability {fmtPct(scan?.final_confidence)} · {scan?.agreement_level || '—'}
          {scan?.tumor_volume_cm3 != null && <div style={{ marginTop: 2 }}>Volume: {fmtVol(scan.tumor_volume_cm3)}</div>}
          {scan?.tumor_location && <div style={{ marginTop: 2 }}>Location: {scan.tumor_location}</div>}
        </div>
      </div>
    </div>
  );
}

export default function CompareMode({
  scans, comparePrev, compareCur,
  onSetPrev, onSetCur,
  growthMap, growthLoading, growthError, onToggleGrowthMap,
}) {
  if (scans.length < 2) {
    return (
      <div style={{ background: '#090c13', border: '2px dashed var(--border-subtle)', borderRadius: 12, padding: '2.5rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <GitCompare size={32} style={{ marginBottom: '1rem' }} />
        <p>At least 2 scans are required for side-by-side comparison.</p>
      </div>
    );
  }

  return (
    <>
      {/* Scan pickers */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <label style={{ flex: 1, minWidth: 220, fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Previous (baseline)
          <select
            className="form-input"
            style={{ marginTop: 6, fontSize: '0.8rem' }}
            value={comparePrev?.scan_id ?? ''}
            onChange={(e) => onSetPrev(scans.find(s => s.scan_id === Number(e.target.value)))}
          >
            {scans.map(s => (
              <option key={s.scan_id} value={s.scan_id}>
                {new Date(s.created_at).toLocaleDateString()} — {s.final_classification || 'Processing'} ({fmtBurden(burdenOf(s))})
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: 1, minWidth: 220, fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Current (latest)
          <select
            className="form-input"
            style={{ marginTop: 6, fontSize: '0.8rem' }}
            value={compareCur?.scan_id ?? ''}
            onChange={(e) => onSetCur(scans.find(s => s.scan_id === Number(e.target.value)))}
          >
            {scans.map(s => (
              <option key={s.scan_id} value={s.scan_id}>
                {new Date(s.created_at).toLocaleDateString()} — {s.final_classification || 'Processing'} ({fmtBurden(burdenOf(s))})
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Side-by-side images */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <ScanCard scan={comparePrev} label="Previous" color="var(--accent-orange)" />
        <ScanCard scan={compareCur} label="Current" color="var(--accent-cyan)" />
      </div>

      <DeltaCards prev={comparePrev} cur={compareCur} />
      <GrowthMapPanel
        growthMap={growthMap}
        growthLoading={growthLoading}
        growthError={growthError}
        onToggle={onToggleGrowthMap}
      />

      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
        Burden is a 2D estimate (tumor area ÷ brain area from the segmentation mask) for single-slice uploads. DICOM / NIfTI volume uploads report a true 3D tumor-to-brain ratio and tumor volume in cm³ from voxel spacing.
      </p>
    </>
  );
}
