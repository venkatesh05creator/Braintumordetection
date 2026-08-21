import React, { useEffect, useState } from 'react';
import { reportsAPI, saveBlob } from '../../api/client';
import { getImageUrl } from '../../api/imageUrl';
import useAuthStore from '../../store/authStore';
import { Eye, Shield, Brain, Activity, FileText, X, Trash2, Download, Loader2 } from 'lucide-react';
import { SYMPTOMS } from '../../constants/symptoms';

// Label map derived from the shared symptom constants — one source of truth.
const SYMPTOM_LABELS = Object.fromEntries(SYMPTOMS.map(s => [s.key, s.label]));

export default function MyReports() {
  const { user } = useAuthStore();
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);

  const patientId = user?.patient_id;

  useEffect(() => {
    if (patientId) {
      reportsAPI.getPatientReports(patientId)
        .then(res => setReports(res.data))
        .catch(() => { })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [patientId]);

  const viewReport = async (reportId) => {
    try {
      const res = await reportsAPI.get(reportId);
      setSelected(res.data);
    } catch (err) {
      console.error("Failed to load report details", err);
    }
  };

  const handleDownload = async (reportId, e) => {
    e?.stopPropagation();
    setDownloadingId(reportId);
    try {
      const res = await reportsAPI.downloadPdf(reportId, 'patient');
      saveBlob(res.data, `NeuroScan-Report-${reportId}-patient.pdf`);
    } catch (err) {
      alert("Failed to download the report PDF. Please try again.");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDeleteReport = async (reportId) => {
    if (!window.confirm("Are you sure you want to delete this report? This action is permanent.")) return;
    try {
      await reportsAPI.delete(reportId);
      setReports((prev) => prev.filter((r) => r.report_id !== reportId));
      setSelected(null);
    } catch (err) {
      alert("Failed to delete report. Please try again.");
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Glass Page Header */}
      <div style={{
        background: 'rgba(34,197,94,0.04)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(34,197,94,0.14)',
        borderRadius: 20, padding: '1.5rem 2rem', marginBottom: '1.5rem',
        boxShadow: '0 0 40px rgba(34,197,94,0.06), 4px 4px 20px rgba(0,0,0,0.5)',
      }}>
        <h1 style={{ fontSize: '1.75rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
          <FileText size={26} color="var(--accent-green)" />
          <span style={{ background: 'linear-gradient(135deg, var(--accent-green), var(--accent-cyan))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>My Reports & Summaries</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Interactive AI-generated diagnostic summaries and clinical segmentation reports.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Report List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <div className="spinner" style={{ margin: '0 auto', width: 36, height: 36, borderWidth: 3 }} />
            </div>
          ) : reports.length === 0 ? (
            <div style={{
              background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, textAlign: 'center', padding: '3rem',
              boxShadow: '5px 5px 16px rgba(0,0,0,0.5), -2px -2px 8px rgba(255,255,255,0.04)',
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
              <h3>No Diagnostic Reports Yet</h3>
              <p style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: '0.9rem' }}>Upload an MRI scan to generate your first consensus diagnostic report.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              {reports.map((r) => {
                const isSelected = selected?.report_id === r.report_id;
                return (
                  <div
                    key={r.report_id}
                    className="glass-card"
                    style={{
                      cursor: 'pointer',
                      borderColor: isSelected ? 'var(--accent-cyan)' : 'var(--border-subtle)',
                      background: isSelected ? 'rgba(0, 212, 159, 0.05)' : 'var(--bg-card)',
                      transition: 'all 0.2s',
                      borderWidth: 1,
                      borderStyle: 'solid'
                    }}
                    onClick={() => viewReport(r.report_id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Scan Analysis Report</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                          {new Date(r.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)', marginTop: 8, fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                          Model: {r.generated_by}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 8,
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '1.1rem'
                        }}>📄</div>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '6px 8px', flexShrink: 0 }}
                          title="Download PDF"
                          disabled={downloadingId === r.report_id}
                          onClick={(e) => handleDownload(r.report_id, e)}
                        >
                          {downloadingId === r.report_id
                            ? <Loader2 className="animate-spin" size={14} />
                            : <Download size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Report Detail Drawer */}
      {selected && (
        <>
          <div className="details-drawer-overlay" onClick={() => setSelected(null)} />
          <div className="details-drawer" style={{ background: 'radial-gradient(circle at 50% 50%, #0c101a 0%, #030712 100%)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.85rem' }}>
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.15rem', color: 'var(--text-primary)' }}>
                  <FileText size={20} style={{ color: 'var(--accent-cyan)' }} />
                  Diagnostic Summary Report
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Scanned on {new Date(selected.created_at).toLocaleString()}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleDownload(selected.report_id)}
                  disabled={downloadingId === selected.report_id}
                  style={{ padding: '0 10px', height: '28px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  {downloadingId === selected.report_id
                    ? <Loader2 className="animate-spin" size={12} />
                    : <Download size={12} />}
                  PDF
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleDeleteReport(selected.report_id)}
                  style={{
                    padding: '0 10px',
                    height: '28px',
                    fontSize: '0.72rem',
                    borderColor: 'rgba(239, 68, 68, 0.3)',
                    color: 'var(--accent-red)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <Trash2 size={12} />
                  Delete
                </button>
                <button className="btn btn-ghost" onClick={() => setSelected(null)} style={{ padding: 4, width: 28, height: 28 }}>
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Diagnostic Metrics & Clinical Verdicts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div className="glass-card" style={{ padding: '1rem', background: '#090c13', border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>AI Consensus Verdict</span>
                <h4 style={{ color: 'var(--accent-cyan)', textTransform: 'capitalize', fontSize: '1.1rem', marginTop: 4, fontWeight: 800 }}>
                  {selected.tumor_type === 'notumor' ? 'No Tumor Detected' : selected.tumor_type}
                </h4>
              </div>
              <div className="glass-card" style={{ padding: '1rem', background: '#090c13', border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Tumor Stage / WHO Grade</span>
                <h4 style={{ color: selected.tumor_stage && selected.tumor_stage !== 'Not staged yet' ? 'var(--accent-purple)' : 'var(--text-secondary)', fontSize: '1.1rem', marginTop: 4, fontWeight: 800 }}>
                  {selected.tumor_stage || 'Not graded yet'}
                </h4>
              </div>
            </div>

            {/* Visual Scan Grid */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                <Eye size={14} style={{ color: 'var(--accent-cyan)' }} /> Visual MRI Heatmaps
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                {selected.original_image_url && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden', background: '#090c13', height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={getImageUrl(selected.original_image_url)} alt="Original MRI" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginTop: 6 }}>Original Scan Slice</span>
                  </div>
                )}
                {selected.segmentation_image_url && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden', background: '#090c13', height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={getImageUrl(selected.segmentation_image_url)} alt="Segmentation" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginTop: 6 }}>Segmented Tumor Outline</span>
                  </div>
                )}
              </div>
            </div>

            {/* Logged Symptoms Snapshot */}
            {selected.symptoms && (
              <div style={{ marginBottom: '1.5rem', background: '#090c13', padding: '1rem', borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
                <h4 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                  <Activity size={14} style={{ color: 'var(--accent-red)' }} /> Logged Symptoms Snapshot (Score: {selected.symptoms.severity_score}%)
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem' }}>
                  {Object.entries(selected.symptoms).map(([key, val]) => {
                    if (key === 'severity_score' || key === 'id' || key === 'created_at' || key === 'patient_id' || key === 'log_date' || key === 'patient_notes') return null;
                    const label = SYMPTOM_LABELS[key] || key;
                    const color = val > 6 ? 'var(--accent-red)' : val > 3 ? 'var(--accent-orange)' : val > 0 ? 'var(--accent-cyan)' : 'var(--text-muted)';
                    return (
                      <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0.6rem', background: 'rgba(255,255,255,0.01)', borderRadius: 6, fontSize: '0.78rem', border: '1px solid rgba(255,255,255,0.015)' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                        <strong style={{ color }}>{val}/10</strong>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Report Insights Monospace Panel */}
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                <Brain size={14} style={{ color: 'var(--accent-purple)' }} /> AI Expert Explanations & Suggestions
              </h4>
              <div style={{
                background: '#090c13',
                borderRadius: 12,
                padding: '1.25rem',
                fontSize: '0.85rem',
                lineHeight: 1.6,
                color: 'var(--text-secondary)',
                maxHeight: 300,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                border: '1px solid var(--border-subtle)',
              }}>
                {selected.content || 'Consensus details parsing.'}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
