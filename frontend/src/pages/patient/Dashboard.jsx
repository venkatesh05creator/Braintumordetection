import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload, Activity, FileText, Bell, Brain, MessageSquare, Shield, AlertTriangle, Calendar, Users } from 'lucide-react';
import useAuthStore from '../../store/authStore';
import { scansAPI, symptomsAPI, alertsAPI } from '../../api/client';
import { getImageUrl } from '../../api/imageUrl';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

// Real per-scan 2D tumor burden (computed from segmentation masks by the backend)
const burdenOf = (scan) => (scan?.tumor_burden_pct ?? null);
const fmtBurden = (v) => (v == null ? '—' : `${Number(v).toFixed(1)}%`);
// final_confidence is a 0-1 probability (0.82 = 82%), not a bare fraction — label it as a probability
const fmtPct = (v) => (v == null ? '—' : `${(Number(v) * 100).toFixed(1)}%`);
const fmtSigned = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}`);
// True 3D volume in cm³ (only present on DICOM / NIfTI uploads with voxel spacing)
const fmtVol = (v) => (v == null ? '—' : `${Number(v).toFixed(2)} cm³`);

export default function PatientDashboard() {
  const { user } = useAuthStore();
  const [scans, setScans] = useState([]);
  const [symptoms, setSymptoms] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const patientId = user?.patient_id;

  useEffect(() => {
    if (patientId) {
      Promise.all([
        scansAPI.getPatientScans(patientId).catch(() => ({ data: [] })),
        symptomsAPI.getHistory(patientId, 7).catch(() => ({ data: [] })),
        alertsAPI.listPatient().catch(() => ({ data: [] }))
      ]).then(([sRes, symRes, aRes]) => {
        setScans(sRes.data);
        setSymptoms(symRes.data);
        setAlerts(aRes.data);
        setLoading(false);
      }).catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [patientId]);

  // Unacknowledged symptom escalation → critical banner until acknowledged
  const escalationAlert = alerts.find(
    (a) => a.alert_type === 'symptom_spike' && !a.is_acknowledged
  ) || null;

  const handleAckEscalation = async () => {
    if (!escalationAlert) return;
    try {
      await alertsAPI.acknowledgePatient(escalationAlert.alert_id);
      setAlerts((prev) => prev.filter((a) => a.alert_id !== escalationAlert.alert_id));
    } catch {
      // Keep the banner visible if the request fails
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  // Real logged symptom severity (0-100 weighted score) — one point per logged
  // day (log_date, not created_at).
  const chartData = symptoms.map(s => ({
    name: new Date(s.log_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    severity: s.severity_score,
  }));

  const hasScans = scans.length > 0;

  // ── Real scan-derived metrics (2D tumor burden from segmentation masks) ──
  const latestScan = scans.length > 0 ? scans[0] : null;   // newest first
  const prevScan = scans.length > 1 ? scans[1] : null;
  const latestBurden = burdenOf(latestScan);
  const prevBurden = burdenOf(prevScan);
  const burdenDelta = latestBurden != null && prevBurden != null ? latestBurden - prevBurden : null;

  return (
    <div className="animate-fade-in">
      {/* Page Header — Glass Banner */}
      <div style={{
        background: 'rgba(0,229,200,0.04)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(0,229,200,0.12)',
        borderRadius: 20,
        padding: '1.5rem 2rem',
        marginBottom: '1.5rem',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem',
        boxShadow: '0 0 40px rgba(0,229,200,0.06), 4px 4px 20px rgba(0,0,0,0.5), -2px -2px 10px rgba(255,255,255,0.04)',
      }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: 4 }}>Hello, <span className="text-gradient-cyan">{user?.full_name?.split(' ')[0]}</span> 👋</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Your personal health portal · AI-assisted tumor monitoring</p>
        </div>
        {hasScans && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>ID: <strong style={{ color: 'var(--accent-cyan)' }}>{user?.patient_id ?? '—'}</strong></span>
            <span className="badge badge-cyan">Active Monitoring</span>
          </div>
        )}
      </div>

      {/* Symptom Escalation Banner — real, unacknowledged symptom-spike alert */}
      {escalationAlert && (
        <div className="alert-banner critical" style={{ marginBottom: '1.25rem' }}>
          <AlertTriangle size={18} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <strong>{escalationAlert.title || 'Symptom Escalation Detected'}</strong>
            <p style={{ fontSize: '0.85rem', marginTop: 2, color: 'var(--text-secondary)' }}>
              {escalationAlert.message}
              {escalationAlert.doctor_name ? ` Your doctor (Dr. ${escalationAlert.doctor_name}) has been notified.` : ''}
            </p>
            {escalationAlert.trigger_reason && (
              <p style={{ fontSize: '0.8rem', marginTop: 4, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                {escalationAlert.trigger_reason}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
            <Link to="/patient/messages" className="btn btn-primary" style={{ padding: '0.45rem 0.9rem', fontSize: '0.78rem' }}>
              Message my doctor
            </Link>
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleAckEscalation}
              style={{ padding: '0.45rem 0.9rem', fontSize: '0.78rem' }}
            >
              I've reviewed this
            </button>
          </div>
        </div>
      )}

      {/* 1. Volumetric Metrics & Health Overview (Only show if scans exist) */}
      {hasScans && (
        <div style={{ marginBottom: '2rem' }}>
          
          {/* Warning Banner — real growth from scan burden deltas */}
          {burdenDelta != null && burdenDelta > 0.5 && latestScan?.final_classification !== 'notumor' && (
            <div className="alert-banner critical" style={{ marginBottom: '1.25rem' }}>
              <AlertTriangle size={18} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
              <div>
                <strong>Medical Volumetric Update</strong>
                <p style={{ fontSize: '0.85rem', marginTop: 2, color: 'var(--text-secondary)' }}>
                  Tumor burden increased {fmtSigned(burdenDelta)} percentage points since your previous scan ({new Date(prevScan.created_at).toLocaleDateString()}). Please consult your doctor for review.
                </p>
              </div>
            </div>
          )}

          {/* Metrics grid — Glass + Neu */}
          <div className="metrics-cards-grid" style={{ marginBottom: '1.5rem' }}>
            {[{
              title: 'Tumor-to-Brain Ratio', icon: <Activity size={14} />, value: fmtBurden(latestBurden), sub: burdenDelta != null ? `${fmtSigned(burdenDelta)} pp vs previous scan` : '2D area ratio • no prior scan', color: burdenDelta == null ? 'var(--text-muted)' : burdenDelta > 0 ? 'var(--accent-red)' : 'var(--accent-green)', bg: burdenDelta == null ? 'rgba(148,163,184,0.06)' : burdenDelta > 0 ? 'rgba(239,68,68,0.07)' : 'rgba(16,185,129,0.07)', border: burdenDelta == null ? 'rgba(148,163,184,0.15)' : burdenDelta > 0 ? 'rgba(239,68,68,0.18)' : 'rgba(16,185,129,0.18)'
            }, {
              title: 'Tumor Probability', icon: <Brain size={14} />, value: fmtPct(latestScan?.final_confidence), sub: `Agreement: ${latestScan?.agreement_level || '—'}`, color: 'var(--accent-cyan)', bg: 'rgba(0,229,200,0.07)', border: 'rgba(0,229,200,0.18)'
            }, {
              title: 'Tumor Volume', icon: <Activity size={14} />, value: fmtVol(latestScan?.tumor_volume_cm3), sub: latestScan?.volume_method ? (latestScan.volume_method === 'nifti' ? `3D volume • ${latestScan.voxel_spacing || ''}` : `Single slice • ${latestScan.voxel_spacing || ''}`) : '2D slice — no volume data', color: latestScan?.tumor_volume_cm3 != null ? 'var(--accent-purple)' : 'var(--text-muted)', bg: 'rgba(168,85,247,0.07)', border: 'rgba(168,85,247,0.18)'
            }, {
              title: 'KPS Rating', icon: <Users size={14} />, value: '—', sub: 'Not recorded', color: 'var(--accent-orange)', bg: 'rgba(249,115,22,0.07)', border: 'rgba(249,115,22,0.18)'
            }].map(card => (
              <div key={card.title} style={{
                background: card.bg, backdropFilter: 'blur(20px)', border: `1px solid ${card.border}`,
                borderRadius: 14, padding: '1.1rem',
                boxShadow: `0 0 20px ${card.bg}, 5px 5px 14px rgba(0,0,0,0.55), -2px -2px 8px rgba(255,255,255,0.04)`,
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${card.color}50, transparent)` }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: card.color, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
                  {card.icon} {card.title}
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, fontFamily: 'Space Grotesk', color: 'var(--text-primary)', lineHeight: 1, marginBottom: '0.3rem' }}>{card.value}</div>
                <div style={{ fontSize: '0.72rem', color: card.color, fontWeight: 600 }}>{card.sub}</div>
              </div>
            ))}
          </div>

          {/* Graphical Trends Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
            
            {/* Symptom Track Line Chart — real logged severity, honest empty state */}
            <div className="glass-card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Symptom Graph</span>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>LOGGED SEVERITY (0-100)</div>
                </div>
                <Calendar size={16} style={{ color: 'var(--text-secondary)' }} />
              </div>
              {chartData.length === 0 ? (
                <div style={{ border: '1px dashed var(--border-subtle)', borderRadius: 10, padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  No symptom logs yet — log your daily symptoms to see your trend here.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                    <Tooltip contentStyle={{ background: '#121620', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8 }} />
                    <Line type="monotone" dataKey="severity" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: '#ef4444' }} name="Logged Severity" />
                  </LineChart>
                </ResponsiveContainer>
              )}
              <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.6rem', lineHeight: 1.5 }}>
                No fixed threshold line: escalation is triggered by a sustained ≥20% rise in severity over 3 consecutive days, not an absolute score.
              </p>
            </div>

            {/* Molecular Profile — honest placeholder; markers require tissue pathology */}
            <div className="molecular-profile-card">
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Genomic Biomarkers</span>
              <div style={{ border: '1px dashed var(--border-subtle)', borderRadius: 10, padding: '0.9rem 0.75rem', textAlign: 'center', marginTop: '0.6rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Not recorded — requires pathology</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                  IDH, MGMT, 1p/19q and Ki-67 come from tissue pathology — they cannot be derived from an MRI scan. A pathology report will populate this panel.
                </div>
              </div>
            </div>
          </div>

          {/* Recent Scans Table */}
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Scan History & Results</span>
              <Link to="/patient/reports" style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>See All Reports</Link>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Uploaded Date</th>
                    <th>Scan Type</th>
                    <th>Tumor-to-Brain Ratio</th>
                    <th>Δ Ratio</th>
                    <th>Location</th>
                    <th>Tumor Volume</th>
                    <th>AI Classification</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.map((scan, i) => {
                    const dateStr = new Date(scan.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const b = burdenOf(scan);
                    const bOlder = burdenOf(scans[i + 1]); // list is newest-first
                    const delta = b != null && bOlder != null ? b - bOlder : null;
                    return (
                      <tr key={scan.scan_id}>
                        <td style={{ fontWeight: 500 }}>{dateStr}</td>
                        <td>MRI T1w-Contrast</td>
                        <td>{fmtBurden(b)}</td>
                        <td style={{ color: delta == null ? 'var(--text-muted)' : delta > 0 ? 'var(--accent-red)' : delta < 0 ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                          {delta == null ? '—' : `${fmtSigned(delta)} pp`}
                        </td>
                        <td>{scan.tumor_location || '—'}</td>
                        <td>{fmtVol(scan.tumor_volume_cm3)}</td>
                        <td>
                          <span className={`badge badge-${scan.agreement_level || 'confirmed'}`} style={{ textTransform: 'capitalize' }}>
                            {scan.final_classification || 'Processed'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* 2. Quick Actions Grid — Glass + Neu Cards */}
      <h3 style={{ fontSize: '1rem', marginBottom: '1rem', marginTop: hasScans ? '2rem' : 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 4, height: 18, background: 'var(--gradient-cyan)', borderRadius: 2, display: 'inline-block' }} />
        Portal Quick Actions
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {[
          { icon: <Upload size={20} />, label: 'Upload MRI Scan', desc: 'Get AI diagnostic report in seconds', to: '/patient/scan', color: 'var(--accent-cyan)', glow: 'rgba(0,229,200,0.12)' },
          { icon: <Activity size={20} />, label: 'Log Symptoms', desc: 'Track headache, motor & energy levels', to: '/patient/symptoms', color: 'var(--accent-purple)', glow: 'rgba(168,85,247,0.12)' },
          { icon: <FileText size={20} />, label: 'My Reports', desc: 'View full radiology notes & results', to: '/patient/reports', color: 'var(--accent-green)', glow: 'rgba(34,197,94,0.12)' },
          { icon: <Brain size={20} />, label: 'AI Assistant', desc: 'Discuss symptom queries with NeuroBot', to: '/patient/chatbot', color: 'var(--accent-orange)', glow: 'rgba(249,115,22,0.12)' },
          { icon: <MessageSquare size={20} />, label: 'Specialist Chat', desc: 'Send queries directly to your doctor', to: '/patient/messages', color: 'var(--accent-pink)', glow: 'rgba(236,72,153,0.12)' },
        ].map((action) => (
          <Link key={action.to} to={action.to} style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(20px)',
              border: `1px solid ${action.glow.replace('0.12', '0.20')}`,
              borderRadius: 16, padding: '1.25rem',
              boxShadow: `0 0 20px ${action.glow}, 5px 5px 14px rgba(0,0,0,0.5), -2px -2px 8px rgba(255,255,255,0.04)`,
              cursor: 'pointer', height: '100%', transition: 'all 0.3s cubic-bezier(0.34,1.56,0.64,1)',
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${action.color}40, transparent)` }} />
              <div style={{ color: action.color, marginBottom: 12, background: action.glow, width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${action.color}30`, boxShadow: `0 0 15px ${action.glow}` }}>{action.icon}</div>
              <h4 style={{ marginBottom: 5, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{action.label}</h4>
              <p style={{ fontSize: '0.78rem', lineHeight: 1.5, color: 'var(--text-muted)' }}>{action.desc}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* 3. How It Works — Neumorphic Step Indicators */}
      <div className="glass-card" style={{ marginBottom: '2rem', padding: '1.5rem' }}>
        <h3 style={{ marginBottom: '1.5rem', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 4, height: 18, background: 'var(--gradient-purple)', borderRadius: 2, display: 'inline-block' }} />
          How Your AI Analysis Works
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1.5rem' }}>
          {[
            { step: '1', title: 'MRI Image Upload', desc: 'Securely upload your MRI slice (.png / .jpg)' },
            { step: '2', title: 'Multi-AI Diagnostic', desc: 'FastAPI routes to three segmenting models' },
            { step: '3', title: 'Consensus Decision', desc: 'Classifications fused for diagnostic precision' },
            { step: '4', title: 'Interactive Reports', desc: 'A plain-language clinical summary is generated' },
          ].map((s) => (
            <div key={s.step} style={{ textAlign: 'center', padding: '0.5rem' }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'var(--neu-base)',
                boxShadow: '5px 5px 14px rgba(0,0,0,0.6), -3px -3px 8px rgba(255,255,255,0.05)',
                border: '1px solid rgba(0,229,200,0.20)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 0.75rem',
                fontSize: '1rem', fontWeight: 800, color: 'var(--accent-cyan)',
                fontFamily: 'Space Grotesk',
              }}>
                {s.step}
              </div>
              <h4 style={{ fontSize: '0.85rem', marginBottom: 5, color: 'var(--text-primary)' }}>{s.title}</h4>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Medical Disclaimer */}
      <div className="alert alert-info" style={{ borderColor: 'rgba(0,229,200,0.20)', background: 'rgba(0,229,200,0.04)' }}>
        <Shield size={18} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
        <div>
          <strong style={{ fontSize: '0.88rem' }}>Patient Advisory Disclaimer</strong>
          <p style={{ fontSize: '0.8rem', marginTop: 3, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Volumetric results and segmentation heatmaps generated by AI models are for clinical support only and do not replace professional diagnoses. Always review these results together with your clinical team.
          </p>
        </div>
      </div>
    </div>
  );
}
