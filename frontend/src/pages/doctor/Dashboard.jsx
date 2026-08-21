import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Activity, LineChart, Brain,
  Search, Plus, AlertTriangle,
  Download, MoreHorizontal, Upload, FileText, Check, Loader2, GitCompare, X, LineChart as LineChartIcon
} from 'lucide-react';
import { patientsAPI, scansAPI, symptomsAPI, reportsAPI, saveBlob } from '../../api/client';
import { getImageUrl } from '../../api/imageUrl';
import useAuthStore from '../../store/authStore';
import {
  LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import EnsembleResultPanel from '../../components/EnsembleResultPanel';
import OverviewTab from '../../components/doctor/OverviewTab';
import CompareMode from '../../components/doctor/CompareMode';

import { burdenOf, fmtBurden, fmtPct, fmtSigned, fmtVol, riskBadge } from '../../components/doctor/formatters';

export default function DoctorDashboard() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [scans, setScans] = useState([]);
  const [selectedScan, setSelectedScan] = useState(null);
  const [symptoms, setSymptoms] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [notes, setNotes] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesMessage, setNotesMessage] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState(null);
  const [calibration, setCalibration] = useState(null);
  const [verdictMsg, setVerdictMsg] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [comparePrev, setComparePrev] = useState(null);
  const [compareCur, setCompareCur] = useState(null);
  const [growthMap, setGrowthMap] = useState(null);
  const [growthLoading, setGrowthLoading] = useState(false);
  const [growthError, setGrowthError] = useState(null);
  const growthReqRef = useRef(0);

  const invalidateGrowthMap = () => {
    growthReqRef.current += 1;
    setGrowthLoading(false);
    setGrowthMap(null);
    setGrowthError(null);
  };

  const toggleCompare = () => {
    const next = !compareMode;
    setCompareMode(next);
    invalidateGrowthMap();
    if (next && scans.length > 0) {
      setCompareCur(scans[0]);
      setComparePrev(scans[1] || scans[0]);
    }
  };

  const toggleGrowthMap = async () => {
    if (growthMap) { invalidateGrowthMap(); return; }
    if (!comparePrev || !compareCur) return;
    const reqId = ++growthReqRef.current;
    setGrowthLoading(true);
    setGrowthError(null);
    try {
      const res = await scansAPI.growthMap(comparePrev.scan_id, compareCur.scan_id);
      if (reqId !== growthReqRef.current) return;
      setGrowthMap(res.data);
    } catch (err) {
      if (reqId !== growthReqRef.current) return;
      setGrowthError(err.response?.data?.detail || 'Could not generate the growth map.');
    } finally {
      if (reqId === growthReqRef.current) setGrowthLoading(false);
    }
  };

  const queryPatientId = searchParams.get('patientId');

  useEffect(() => {
    patientsAPI.list().then(res => { setPatients(res.data); setLoading(false); }).catch(() => setLoading(false));
    scansAPI.getCalibration().then(res => setCalibration(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (patients.length === 0) return;
    let target = queryPatientId ? patients.find(p => p.id === Number(queryPatientId)) : null;
    if (!target) { target = patients[0]; setSearchParams({ patientId: target.id }); }
    if (target) {
      setSelectedPatient(target);
      setNotes(target.clinical_notes || '');
      setSelectedLog(null);
      scansAPI.getPatientScans(target.id).then(res => {
        setScans(res.data);
        setSelectedScan(res.data.length > 0 ? res.data[0] : null);
      }).catch(() => { setScans([]); setSelectedScan(null); });
      symptomsAPI.getHistory(target.id, 7).then(res => setSymptoms(res.data)).catch(() => setSymptoms([]));
    }
  }, [patients, queryPatientId]);

  const selectPatient = (patientId) => { setSearchParams({ patientId }); setActiveTab('overview'); };

  const handleNotesSave = async () => {
    if (!selectedPatient) return;
    setNotesSaving(true); setNotesMessage(null);
    try {
      await patientsAPI.update(selectedPatient.id, { clinical_notes: notes });
      setPatients(patients.map(p => p.id === selectedPatient.id ? { ...p, clinical_notes: notes } : p));
      setNotesMessage({ type: 'success', text: 'Clinical notes updated successfully.' });
    } catch { setNotesMessage({ type: 'error', text: 'Failed to update clinical notes. Please try again.' }); }
    finally { setNotesSaving(false); }
  };

  const handleVerdict = async (verdict, note) => {
    if (!selectedScan) return;
    setVerdictMsg(null);
    try {
      const res = await scansAPI.recordVerdict(selectedScan.scan_id, { verdict, note });
      const updated = { ...selectedScan, doctor_verdict: verdict, doctor_verdict_at: res.data.doctor_verdict_at, doctor_verdict_note: note || null };
      setSelectedScan(updated);
      setScans(scans.map(s => s.scan_id === selectedScan.scan_id ? updated : s));
      setVerdictMsg({ type: 'success', text: `Verdict recorded — ${verdict === 'confirmed' ? 'confirmed' : 'disagreed'}. The calibration curve is updated.` });
      scansAPI.getCalibration().then(r => setCalibration(r.data)).catch(() => {});
    } catch (err) { setVerdictMsg(null); throw err; }
  };

  const handleDownloadReport = async () => {
    if (!selectedScan?.report_id) { setDownloadMsg({ type: 'warning', text: 'No report has been generated for this scan yet.' }); return; }
    setDownloading(true); setDownloadMsg(null);
    try {
      const res = await reportsAPI.downloadPdf(selectedScan.report_id, 'doctor');
      saveBlob(res.data, `NeuroScan-Report-${selectedScan.report_id}.pdf`);
      setDownloadMsg({ type: 'success', text: 'PDF report downloaded.' });
    } catch { setDownloadMsg({ type: 'error', text: 'Failed to generate the PDF report. Please try again.' }); }
    finally { setDownloading(false); }
  };

  const handleScanUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedPatient) return;
    setUploading(true); setUploadError(null); setUploadSuccess(false);
    try {
      await scansAPI.upload(selectedPatient.id, file);
      setUploadSuccess(true);
      const scansRes = await scansAPI.getPatientScans(selectedPatient.id);
      setScans(scansRes.data);
      if (scansRes.data.length > 0) setSelectedScan(scansRes.data[0]);
      setTimeout(() => { setUploadSuccess(false); setActiveTab('ai-analysis'); }, 1500);
    } catch (err) { setUploadError(err.response?.data?.detail || "Scan upload or processing failed."); }
    finally { setUploading(false); }
  };

  const filteredPatients = patients.filter(p => p.full_name?.toLowerCase().includes(search.toLowerCase()));
  const criticalCount = patients.filter(p => p.risk_level === 'critical' || p.risk_level === 'high').length;
  const moderateCount = patients.filter(p => p.risk_level === 'medium').length;
  const stableCount = patients.filter(p => p.risk_level === 'low').length;

  // Derived metrics
  const latestScan = scans[0] || null;
  const prevScan = scans[1] || null;
  const latestBurden = burdenOf(latestScan);
  const prevBurden = burdenOf(prevScan);
  const burdenDelta = latestBurden != null && prevBurden != null ? latestBurden - prevBurden : null;

  const calibrationFootnote = (() => {
    const conf = latestScan?.final_confidence;
    if (conf == null || !calibration) return null;
    const bucket = (calibration.buckets || []).find(
      b => conf >= b.min && (conf < b.max || (b.max === 1 && conf === 1))
    );
    if (!bucket || bucket.total === 0) return 'No doctor verdicts in this confidence range yet — calibration builds as scans are reviewed.';
    return `When the model says ${bucket.label}, doctors confirmed it ${Math.round(bucket.rate * 100)}% (n=${bucket.total})`;
  })();

  // ── Loading / empty states ──
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh', flexDirection: 'column', gap: '1rem' }}>
      <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }} />
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading patient data...</p>
    </div>
  );

  if (patients.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
      <div className="glass-panel animate-scale-in" style={{ padding: '3rem', textAlign: 'center', maxWidth: 540 }}>
        <div style={{ width: 80, height: 80, borderRadius: 24, background: 'rgba(0,229,200,0.08)', border: '1px solid rgba(0,229,200,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', boxShadow: '0 0 40px rgba(0,229,200,0.12)' }}>
          <Users size={40} color="var(--accent-cyan)" />
        </div>
        <h2 style={{ marginBottom: '0.75rem' }}>Welcome to NeuroAI Diagnostic Suite</h2>
        <p style={{ color: 'var(--text-muted)', margin: '0 0 2rem 0', lineHeight: 1.7 }}>No patients are currently linked to your profile. Invite patients or accept pending requests to start diagnosing.</p>
        <button onClick={() => navigate('/doctor/patients')} className="btn btn-primary">Manage Patient Connections</button>
      </div>
    </div>
  );

  // ── Main layout ──
  return (
    <div className="workspace-layout animate-fade-in">
      {/* Patient Queue */}
      <div className="patient-queue-col" style={{ background: 'rgba(8,10,26,0.80)', backdropFilter: 'blur(30px)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="patient-queue-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem', marginBottom: '0.75rem' }}>
          <div className="patient-queue-title" style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: '0.95rem' }}>Patient Queue</div>
          <div style={{ position: 'relative', marginTop: '0.75rem' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="form-input" style={{ paddingLeft: '2rem', fontSize: '0.8rem', height: '34px' }} placeholder="Search patients..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="patient-queue-list">
          {filteredPatients.map(p => {
            const isActive = selectedPatient?.id === p.id;
            return (
              <div key={p.id} className={`patient-queue-item ${isActive ? 'active' : ''}`} onClick={() => selectPatient(p.id)}
                style={isActive ? { background: 'rgba(0,229,200,0.08)', border: '1px solid rgba(0,229,200,0.20)', boxShadow: 'inset 3px 3px 8px rgba(0,0,0,0.5), inset -2px -2px 6px rgba(255,255,255,0.03)', borderRadius: 10 } : { borderRadius: 10 }}>
                <div className="patient-queue-avatar" style={{ borderRadius: 10, background: isActive ? 'var(--gradient-cyan)' : 'rgba(255,255,255,0.08)', color: isActive ? '#050b18' : 'var(--text-secondary)' }}>
                  {p.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <div className="patient-queue-info">
                  <div className="patient-queue-name" style={{ color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)' }}>{p.full_name}</div>
                  <div className="patient-queue-meta">{p.tumor_type || 'No diagnosis yet'}</div>
                  <div className="patient-queue-stats">
                    <span className="patient-queue-volume">{p.latest_burden_pct != null ? `${Number(p.latest_burden_pct).toFixed(1)}%` : '—'}</span>
                    <span className={`patient-queue-trend ${p.risk_level === 'critical' || p.risk_level === 'high' ? 'up' : 'down'}`}>{p.risk_level || 'unknown'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="patient-queue-summary" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '0.75rem' }}>
          <div className="patient-queue-summary-item"><span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Critical</span><span style={{ color: 'var(--accent-red)', fontWeight: 700 }}>{criticalCount}</span></div>
          <div className="patient-queue-summary-item"><span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Moderate</span><span style={{ color: 'var(--accent-orange)', fontWeight: 700 }}>{moderateCount}</span></div>
          <div className="patient-queue-summary-item"><span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Stable</span><span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>{stableCount}</span></div>
        </div>
      </div>

      {/* Patient Workspace */}
      {selectedPatient && (
        <div className="patient-workspace-col">
          {/* Header */}
          <div className="workspace-header" style={{ background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'Space Grotesk' }}>#{selectedPatient.id}</span>
                {riskBadge(selectedPatient.risk_level)}
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{scans.length} scan{scans.length === 1 ? '' : 's'} recorded</span>
              </div>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '0.2rem' }}>{selectedPatient.full_name}</h2>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {selectedPatient.tumor_type || 'No diagnosis yet'}{latestScan ? ` • Latest: ${new Date(latestScan.created_at).toLocaleDateString()}` : ' • No scans uploaded'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <label className="btn btn-primary btn-sm" style={{ display: 'inline-flex', cursor: 'pointer' }}>
                <Plus size={15} /> New Scan
                <input type="file" accept="image/*" onChange={handleScanUpload} style={{ display: 'none' }} disabled={uploading} />
              </label>
              <button className="btn btn-secondary btn-sm" style={{ width: '38px', padding: 0, justifyContent: 'center' }} title={selectedScan?.report_id ? 'Download Report (PDF)' : 'No report generated for this scan'} onClick={handleDownloadReport} disabled={downloading || !selectedScan?.report_id}>
                {downloading ? <Loader2 className="animate-spin" size={15} /> : <Download size={15} />}
              </button>
              <button className="btn btn-ghost btn-sm" style={{ width: '34px', padding: 0, justifyContent: 'center' }}><MoreHorizontal size={15} /></button>
            </div>
          </div>

          {/* Tab bar */}
          <div className="workspace-tabs" style={{ padding: '0.5rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--neu-base)', borderRadius: 10, padding: '0.25rem', boxShadow: 'var(--neu-inset)', width: 'fit-content' }}>
              {[
                { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={13} /> },
                { id: 'mri-viewer', label: 'MRI Viewer', icon: <Activity size={13} /> },
                { id: 'ai-analysis', label: 'AI Analysis', icon: <Brain size={13} /> },
                { id: 'growth-timeline', label: 'Timeline', icon: <LineChart size={13} /> },
                { id: 'clinical-notes', label: 'Notes', icon: <FileText size={13} /> }
              ].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0.4rem 0.85rem', borderRadius: 8,
                    border: activeTab === tab.id ? '1px solid rgba(0,229,200,0.22)' : '1px solid transparent',
                    background: activeTab === tab.id ? 'rgba(0,229,200,0.10)' : 'transparent',
                    color: activeTab === tab.id ? 'var(--accent-cyan)' : 'var(--text-muted)',
                    fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    boxShadow: activeTab === tab.id ? 'var(--neu-raised)' : 'none', transition: 'all 0.2s ease', whiteSpace: 'nowrap' }}>
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div className="patient-workspace-scroll">
            {downloadMsg && <div className={`alert alert-${downloadMsg.type}`} style={{ marginBottom: '1.25rem' }}>{downloadMsg.text}</div>}

            {activeTab === 'overview' && (
              <OverviewTab
                scans={scans} symptoms={symptoms} selectedLog={selectedLog} onSelectLog={setSelectedLog}
                calibrationFootnote={calibrationFootnote} onTabChange={setActiveTab}
                onSelectScan={(scan) => { setSelectedScan(scan); setActiveTab('ai-analysis'); }}
              />
            )}

            {activeTab === 'mri-viewer' && (
              <div className="glass-card" style={{ display: 'grid', gridTemplateColumns: scans.length > 0 ? '1.5fr 1fr' : '1fr', gap: '1.5rem', padding: '1.5rem' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: '1.1rem', margin: 0 }}>MRI Visualizer</h3>
                    <button onClick={toggleCompare} className={`btn ${compareMode ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} disabled={scans.length < 2}
                      title={scans.length < 2 ? 'At least 2 scans are required for comparison' : ''}>
                      <GitCompare size={14} /> {compareMode ? 'Exit Compare' : 'Compare Scans'}
                    </button>
                  </div>
                  {compareMode ? (
                    <CompareMode scans={scans} comparePrev={comparePrev} compareCur={compareCur}
                      onSetPrev={(s) => { setComparePrev(s); invalidateGrowthMap(); }}
                      onSetCur={(s) => { setCompareCur(s); invalidateGrowthMap(); }}
                      growthMap={growthMap} growthLoading={growthLoading} growthError={growthError} onToggleGrowthMap={toggleGrowthMap} />
                  ) : (
                    <>
                      {selectedScan ? (
                        <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.25rem', boxShadow: 'inset 4px 4px 12px rgba(0,0,0,0.6), inset -2px -2px 8px rgba(255,255,255,0.03)' }}>
                          <img src={getImageUrl(selectedScan.original_image_url)} alt="Patient MRI Scan"
                            style={{ maxWidth: '100%', maxHeight: '380px', borderRadius: 10, objectFit: 'contain', boxShadow: '0 8px 30px rgba(0,0,0,0.7)' }} />
                          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                            {selectedScan.segmentation_image_url && (
                              <div style={{ textAlign: 'center' }}>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Segmentation</span>
                                <img src={getImageUrl(selectedScan.segmentation_image_url)} alt="Segmentation" style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(0,229,200,0.20)', boxShadow: '0 0 15px rgba(0,229,200,0.10)' }} />
                              </div>
                            )}
                            {selectedScan.gradcam_image_url && (
                              <div style={{ textAlign: 'center' }}>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Grad-CAM</span>
                                <img src={getImageUrl(selectedScan.gradcam_image_url)} alt="Gradcam" style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(168,85,247,0.25)', boxShadow: '0 0 15px rgba(168,85,247,0.12)' }} />
                              </div>
                            )}
                          </div>
                          {(selectedScan?.tumor_volume_cm3 != null || selectedScan?.tumor_location || selectedScan?.tumor_size_estimate) && (() => {
                            const parts = [
                              selectedScan?.tumor_volume_cm3 != null && ['Volume', fmtVol(selectedScan.tumor_volume_cm3)],
                              selectedScan?.tumor_location && ['Location', selectedScan.tumor_location],
                              selectedScan?.tumor_size_estimate && ['Size', selectedScan.tumor_size_estimate],
                            ].filter(Boolean);
                            return (
                              <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.6 }}>
                                {parts.map(([label, value], idx) => (
                                  <span key={label}>{idx > 0 && <span style={{ margin: '0 6px' }}>·</span>}<strong style={{ color: 'var(--text-primary)' }}>{label}:</strong> {value}</span>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <div className="dropzone" style={{ padding: '3rem 1.5rem' }}>
                          <Activity size={36} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
                          <p style={{ color: 'var(--text-muted)' }}>No scan selected. Upload a scan or choose one below.</p>
                        </div>
                      )}
                    </>
                  )}
                  {/* Upload zone */}
                  <div style={{ marginTop: '1.25rem', background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(10px)', padding: '1rem', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>Upload MRI Scan</span>
                    <label className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', cursor: 'pointer' }}>
                      <Upload size={13} /> Choose File
                      <input type="file" accept="image/*" onChange={handleScanUpload} style={{ display: 'none' }} disabled={uploading} />
                    </label>
                    {uploading && <div className="alert alert-info" style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem' }}>Processing through Multi-AI Ensemble models...</div>}
                    {uploadSuccess && <div className="alert alert-success" style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}><Check size={13} /> Scan processed and diagnosed!</div>}
                    {uploadError && <div className="alert alert-error" style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem' }}>{uploadError}</div>}
                  </div>
                </div>
                {/* Scan list sidebar */}
                {scans.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>All Patient Scans</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '500px', overflowY: 'auto' }}>
                      {scans.map(scan => {
                        const isChosen = selectedScan?.scan_id === scan.scan_id;
                        return (
                          <div key={scan.scan_id}
                            style={{ padding: '0.75rem', border: `1px solid ${isChosen ? 'var(--accent-cyan)' : 'var(--border-subtle)'}`, background: isChosen ? 'rgba(0, 212, 159, 0.05)' : 'var(--bg-primary)', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                            onClick={() => { if (compareMode) { setCompareCur(scan); setGrowthMap(null); setGrowthError(null); } else { setSelectedScan(scan); } }}>
                            <div>
                              <strong style={{ fontSize: '0.8rem', display: 'block' }}>{scan.final_classification || 'Processed Scan'}</strong>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(scan.created_at).toLocaleString()}</span>
                            </div>
                            {scan.original_image_url && <img src={getImageUrl(scan.original_image_url)} alt="MRI Mini" style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover' }} />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'ai-analysis' && (
              <div className="glass-card" style={{ padding: '1.5rem' }}>
                {verdictMsg && <div className={`alert alert-${verdictMsg.type}`} style={{ marginBottom: '1rem' }}>{verdictMsg.text}</div>}
                {selectedScan ? (
                  <EnsembleResultPanel
                    result={{
                      ensemble: {
                        final_tumor_type: selectedScan.final_classification, final_confidence: selectedScan.final_confidence,
                        agreement_level: selectedScan.agreement_level, uncertainty_flag: selectedScan.uncertainty_flag,
                        agent_votes: selectedScan.agent_votes || [], class_scores: selectedScan.ensemble_metadata?.class_scores || {},
                        recommendation: selectedScan.ensemble_metadata?.recommendation || 'Clinical review recommended.',
                        risk_level: selectedScan.ensemble_metadata?.risk_level || 'unknown',
                        agents_count: selectedScan.agent_votes?.length || 0, total_latency_ms: selectedScan.ensemble_metadata?.total_latency_ms || 0,
                        failed_agents: selectedScan.ensemble_metadata?.failed_agents || [],
                      },
                      segmentation_image_url: selectedScan.segmentation_image_url, gradcam_image_url: selectedScan.gradcam_image_url,
                      gradcam_glioma_url: selectedScan.gradcam_glioma_url, gradcam_meningioma_url: selectedScan.gradcam_meningioma_url,
                      gradcam_pituitary_url: selectedScan.gradcam_pituitary_url, original_image_url: selectedScan.original_image_url,
                    }}
                    doctorVerdict={selectedScan.doctor_verdict} doctorVerdictAt={selectedScan.doctor_verdict_at}
                    doctorVerdictNote={selectedScan.doctor_verdict_note} onVerdict={handleVerdict} onReset={() => setSelectedScan(null)} />
                ) : (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    <Brain size={48} style={{ marginBottom: '1.5rem', color: 'var(--text-muted)' }} />
                    <p>No MRI scan selected. Select a scan from the scan history list to run AI Ensemble analysis.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'growth-timeline' && (() => {
              const timed = scans.filter(s => burdenOf(s) != null).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
              return (
                <div className="glass-card" style={{ padding: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>Tumor Burden Growth Chart</h3>
                  {timed.length < 2 ? (
                    <div style={{ background: '#090c13', border: '2px dashed var(--border-subtle)', borderRadius: 12, padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <LineChartIcon size={36} style={{ marginBottom: '1rem' }} />
                      <p>At least 2 scans with a measurable tumor burden are required to plot a growth timeline.</p>
                    </div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={300}>
                        <RechartsLineChart data={timed.map(s => ({ date: new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), burden: burdenOf(s) }))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#94a3b8' }} name="Tumor Burden (%)" />
                          <Tooltip contentStyle={{ background: '#121620', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8 }} />
                          <Line type="monotone" dataKey="burden" stroke="var(--accent-cyan)" strokeWidth={3} dot={{ r: 4, fill: 'var(--accent-cyan)' }} name="Tumor Burden (%)" />
                        </RechartsLineChart>
                      </ResponsiveContainer>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
                        2D tumor-burden estimate computed from each scan's segmentation mask (tumor area ÷ brain area) — a trend proxy, not a volumetric measurement.
                      </p>
                    </>
                  )}
                </div>
              );
            })()}

            {activeTab === 'clinical-notes' && (
              <div className="glass-card" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Clinical Documentation</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Edit the medical file, notes, active symptoms, or patient care instructions below.</p>
                <textarea className="form-input" style={{ minHeight: '220px', fontSize: '0.875rem', lineHeight: '1.6', fontFamily: 'inherit', resize: 'vertical', marginBottom: '1.5rem' }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Enter medical findings, pathology details, or recovery instructions..." />
                {notesMessage && <div className={`alert alert-${notesMessage.type === 'success' ? 'success' : 'error'}`} style={{ marginBottom: '1rem' }}>{notesMessage.text}</div>}
                <button onClick={handleNotesSave} className="btn btn-primary" disabled={notesSaving}>{notesSaving ? 'Saving Notes...' : 'Save Clinical Notes'}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
