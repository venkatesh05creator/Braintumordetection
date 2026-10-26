import React from 'react';
import { Activity, Brain, Users, AlertTriangle, Calendar, X } from 'lucide-react';
import { SYMPTOMS, getSymptomLevelText } from '../../constants/symptoms';
import { burdenOf, fmtBurden, fmtPct, fmtSigned, fmtVol } from './formatters';
import {
  LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

// Clickable dot — selects that day's full log.
const SymptomDot = ({ cx, cy, r, payload, onSelect, selected }) => (
  <circle
    cx={cx} cy={cy} r={(r || 4) + (selected ? 2 : 0)}
    fill="#ef4444" stroke={selected ? '#fff' : 'none'} strokeWidth={selected ? 1.5 : 0}
    style={{ cursor: 'pointer' }}
    onClick={(e) => { e.stopPropagation(); if (payload) onSelect(payload); }}
  />
);

export default function OverviewTab({ scans, symptoms, selectedLog, onSelectLog, calibrationFootnote, onTabChange, onSelectScan }) {
  const latestScan = scans[0] || null;
  const prevScan = scans[1] || null;
  const latestBurden = burdenOf(latestScan);
  const prevBurden = burdenOf(prevScan);
  const burdenDelta = latestBurden != null && prevBurden != null ? latestBurden - prevBurden : null;

  const chartData = symptoms.map(s => ({
    ...s,
    name: new Date(s.log_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    severity: s.severity_score,
  }));

  const metricsCards = [
    {
      title: 'Tumor-to-Brain Ratio', icon: <Activity size={14} />, value: fmtBurden(latestBurden),
      sub: burdenDelta != null ? `${fmtSigned(burdenDelta)} pp vs previous scan` : '2D area ratio • no prior scan',
      color: burdenDelta == null ? 'var(--text-muted)' : burdenDelta > 0 ? 'var(--accent-red)' : 'var(--accent-green)',
      bg: burdenDelta == null ? 'rgba(148,163,184,0.06)' : burdenDelta > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
      border: burdenDelta == null ? 'rgba(148,163,184,0.15)' : burdenDelta > 0 ? 'rgba(239,68,68,0.20)' : 'rgba(16,185,129,0.20)',
    },
    {
      title: 'Tumor Probability', icon: <Brain size={14} />, value: fmtPct(latestScan?.final_confidence),
      sub: `Agreement: ${latestScan?.agreement_level || '—'}`,
      color: 'var(--accent-cyan)', bg: 'rgba(0,229,200,0.08)', border: 'rgba(0,229,200,0.20)',
      footnote: calibrationFootnote,
    },
    {
      title: 'Tumor Volume', icon: <Activity size={14} />, value: fmtVol(latestScan?.tumor_volume_cm3),
      sub: latestScan?.volume_method ? (latestScan.volume_method === 'nifti' ? `3D volume • ${latestScan.voxel_spacing || ''}` : `Single slice • ${latestScan.voxel_spacing || ''}`) : '2D slice — no volume data',
      color: latestScan?.tumor_volume_cm3 != null ? 'var(--accent-purple)' : 'var(--text-muted)',
      bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.20)',
    },
    {
      title: 'KPS Score', icon: <Users size={14} />, value: '—', sub: 'Not recorded',
      color: 'var(--accent-orange)', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.20)',
    },
  ];

  return (
    <>
      {/* Warning banner */}
      {burdenDelta != null && burdenDelta > 0.5 && latestScan?.final_classification !== 'notumor' && (
        <div className="alert-banner critical" style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <AlertTriangle size={18} style={{ color: 'var(--accent-red)' }} />
            <span style={{ fontSize: '0.85rem' }}>
              Tumor burden increased {fmtSigned(burdenDelta)} percentage points since the previous scan ({new Date(prevScan.created_at).toLocaleDateString()}). Review recommended.
            </span>
          </div>
          <button onClick={() => onTabChange('mri-viewer')} className="btn btn-ghost btn-sm" style={{ borderColor: 'rgba(239, 68, 68, 0.3)', color: '#fca5a5' }}>Review</button>
        </div>
      )}

      {/* Metrics Cards Grid */}
      <div className="metrics-cards-grid">
        {metricsCards.map(card => (
          <div key={card.title} style={{
            background: card.bg, backdropFilter: 'blur(20px)', border: `1px solid ${card.border}`,
            borderRadius: 14, padding: '1.1rem',
            boxShadow: `0 0 20px ${card.bg}, 4px 4px 12px rgba(0,0,0,0.5), -2px -2px 8px rgba(255,255,255,0.04)`,
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${card.color}50, transparent)` }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: card.color, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
              {card.icon} {card.title}
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, fontFamily: 'Space Grotesk', color: 'var(--text-primary)', lineHeight: 1, marginBottom: '0.3rem' }}>{card.value}</div>
            <div style={{ fontSize: '0.72rem', color: card.color, fontWeight: 600 }}>{card.sub}</div>
            {card.footnote && (
              <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: '0.6rem', lineHeight: 1.45, borderTop: '1px dashed var(--border-subtle)', paddingTop: '0.5rem' }}>
                <strong style={{ color: 'var(--text-secondary)' }}>Calibration:</strong> {card.footnote}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Chart & Molecular Profile */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Symptom Chart — inlined */}
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Symptom Tracker</span>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>DAILY LOGGED SEVERITY (0-100)</div>
            </div>
            <Calendar size={16} style={{ color: 'var(--text-secondary)' }} />
          </div>
          {chartData.length === 0 ? (
            <div style={{ border: '1px dashed var(--border-subtle)', borderRadius: 10, padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              No symptom logs for this patient yet — logged entries appear here.
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <RechartsLineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ background: '#121620', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8 }} />
                  <Line type="monotone" dataKey="severity" stroke="#ef4444" strokeWidth={2} name="Logged Severity"
                    dot={(dotProps) => <SymptomDot {...dotProps} selected={selectedLog?.id === dotProps.payload?.id} onSelect={onSelectLog} />} />
                </RechartsLineChart>
              </ResponsiveContainer>
              <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 4 }}>Click a point to see that day's full symptom breakdown.</div>
            </>
          )}
          {selectedLog && (
            <div style={{ marginTop: '0.75rem', border: '1px solid rgba(0,229,200,0.18)', background: 'rgba(0,229,200,0.04)', borderRadius: 12, padding: '0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                  {new Date(selectedLog.log_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  <span style={{ marginLeft: '0.5rem', color: 'var(--accent-red)', fontWeight: 700 }}>{selectedLog.severity_score}/100</span>
                </div>
                <button onClick={() => onSelectLog(null)} className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', width: 'auto' }} title="Close detail"><X size={13} /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.4rem 0.9rem' }}>
                {SYMPTOMS.map(({ key, label, color }) => {
                  const value = selectedLog[key] ?? 0;
                  return (
                    <div key={key} style={{ fontSize: '0.72rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                        <span style={{ fontWeight: 700, color }}>{value} · {getSymptomLevelText(value)}</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', marginTop: 3 }}>
                        <div style={{ width: `${value * 10}%`, height: '100%', borderRadius: 2, background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: '0.6rem', fontSize: '0.74rem', color: 'var(--text-secondary)', borderTop: '1px dashed var(--border-subtle)', paddingTop: '0.5rem' }}>
                <strong style={{ color: 'var(--text-muted)' }}>Patient notes:</strong>{' '}
                {selectedLog.patient_notes || <em style={{ color: 'var(--text-muted)' }}>No notes for this day.</em>}
              </div>
            </div>
          )}
          <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.6rem', lineHeight: 1.5 }}>
            No fixed threshold line: escalation is triggered by a sustained ≥20% rise in severity over 3 consecutive days, not an absolute score.
          </p>
        </div>

        {/* Molecular Profile */}
        <div className="molecular-profile-card">
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Molecular Profile</span>
          <div style={{ border: '1px dashed var(--border-subtle)', borderRadius: 10, padding: '0.9rem 0.75rem', textAlign: 'center', marginTop: '0.6rem' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Not recorded — requires pathology</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
              IDH, MGMT, 1p/19q, EGFR, TERT and Ki-67 come from tissue pathology — they cannot be derived from an MRI scan. A pathology report will populate this panel.
            </div>
          </div>
        </div>
      </div>

      {/* Scan History — inlined */}
      <div className="glass-card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Scan History</span>
          <span onClick={() => onTabChange('mri-viewer')} style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', cursor: 'pointer', fontWeight: 600 }}>View All</span>
        </div>
        {scans.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No MRI Scans uploaded yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr><th>Date</th><th>Scan Type</th><th>Tumor Burden</th><th>Δ Burden</th><th>Finding</th><th>Verdict</th></tr>
              </thead>
              <tbody>
                {scans.map((scan, i) => {
                  const dateStr = new Date(scan.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  const b = burdenOf(scan);
                  const bOlder = burdenOf(scans[i + 1]);
                  const delta = b != null && bOlder != null ? b - bOlder : null;
                  return (
                    <tr key={scan.scan_id} style={{ cursor: 'pointer' }} onClick={() => onSelectScan(scan)}>
                      <td style={{ fontWeight: 500 }}>{dateStr}</td>
                      <td>MRI Contrast (T1w)</td>
                      <td>{fmtBurden(b)}</td>
                      <td style={{ color: delta == null ? 'var(--text-muted)' : delta > 0 ? 'var(--accent-red)' : delta < 0 ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                        {delta == null ? '—' : `${fmtSigned(delta)} pp`}
                      </td>
                      <td><span className={`badge badge-${scan.agreement_level || 'confirmed'}`} style={{ textTransform: 'capitalize' }}>{scan.final_classification || 'Processing'}</span></td>
                      <td>
                        {scan.doctor_verdict ? (
                          <span className={`badge ${scan.doctor_verdict === 'confirmed' ? 'badge-confirmed' : 'badge-uncertain'}`} style={{ fontSize: '0.62rem', padding: '1px 7px' }}>
                            {scan.doctor_verdict === 'confirmed' ? '✓ Confirmed' : '✗ Disagreed'}
                          </span>
                        ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Not reviewed</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
