import React, { useEffect, useState } from 'react';
import {
  CheckCircle, AlertTriangle, AlertOctagon, Info,
  ChevronDown, ChevronUp, RefreshCw, Bot, Loader2, Check, FileText, ShieldCheck
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import { systemAPI } from '../api/client';
import { getImageUrl } from '../api/imageUrl';

const AGENT_NAMES = {
  gemini_vision: 'Gemini Vision',
  huggingface_vit: 'HuggingFace ViT',
  local_cv: 'Local CV',
};
const nameAgents = (ids) => (ids || []).map(id => AGENT_NAMES[id] || id);

const TUMOR_COLORS = {
  glioma: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'Glioma' },
  meningioma: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: 'Meningioma' },
  pituitary: { color: '#00d4ff', bg: 'rgba(0,212,255,0.1)', label: 'Pituitary Adenoma' },
  notumor: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: 'No Tumor' },
};

const AGREEMENT_CONFIG = {
  confirmed: { icon: <CheckCircle size={16} />, label: 'CONFIRMED', class: 'badge-confirmed' },
  likely: { icon: <Info size={16} />, label: 'LIKELY', class: 'badge-likely' },
  uncertain: { icon: <AlertTriangle size={16} />, label: 'UNCERTAIN', class: 'badge-uncertain' },
};

function AgentVoteCard({ vote }) {
  const [expanded, setExpanded] = useState(false);
  const tumorInfo = TUMOR_COLORS[vote.tumor_type] || TUMOR_COLORS.notumor;
  const confidence = vote.confidence || 0;

  if (!vote.success) {
    return (
      <div className="agent-card failed">
        <div className="agent-name">⚠️ {vote.agent_name}</div>
        <div style={{ color: 'var(--accent-red)', fontSize: '0.8rem' }}>
          Agent unavailable — {vote.reasoning?.slice(0, 60)}
        </div>
      </div>
    );
  }

  return (
    <div className="agent-card success">
      <div className="agent-name">🤖 {vote.agent_name}</div>
      <div className="agent-verdict" style={{ color: tumorInfo.color }}>
        {tumorInfo.label}
      </div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '0.8rem',
        color: 'var(--text-secondary)',
        marginTop: 4,
      }}>
        <span>Confidence</span>
        <span style={{ color: tumorInfo.color, fontWeight: 700 }}>
          {(confidence * 100).toFixed(1)}%
        </span>
      </div>
      <div className="confidence-bar">
        <div
          className="confidence-fill"
          style={{
            width: `${confidence * 100}%`,
            background: `linear-gradient(90deg, ${tumorInfo.color}88, ${tumorInfo.color})`,
          }}
        />
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
        {vote.latency_ms?.toFixed(0)}ms
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', fontSize: '0.75rem',
          display: 'flex', alignItems: 'center', gap: 4, marginTop: 8,
          padding: 0,
        }}
      >
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {expanded ? 'Hide' : 'Show'} reasoning
      </button>

      {expanded && (
        <div style={{
          marginTop: 8, padding: '0.5rem', background: 'var(--overlay-soft)',
          borderRadius: 8, fontSize: '0.75rem', color: 'var(--text-secondary)',
          lineHeight: 1.5,
        }}>
          {vote.reasoning}
        </div>
      )}
    </div>
  );
}

function ConsensusGauge({ agreementLevel, confidence }) {
  const pct = Math.round(confidence * 100);
  const colors = {
    confirmed: '#10b981',
    likely: '#00d4ff',
    uncertain: '#f59e0b',
  };
  const color = colors[agreementLevel] || '#94a3b8';

  return (
    <div className="consensus-gauge">
      <div
        className="gauge-ring"
        style={{
          '--gauge-pct': `${pct}%`,
          color,
          background: `rgba(${agreementLevel === 'confirmed' ? '16,185,129' : agreementLevel === 'likely' ? '0,212,255' : '245,158,11'}, 0.1)`,
          border: `4px solid ${color}33`,
        }}
      >
        {pct}%
      </div>
      <div style={{ fontSize: '0.8rem', fontWeight: 600, color }}>
        Tumor Probability
      </div>
    </div>
  );
}

/**
 * Doctor-only verdict control — feeds the calibration ledger.
 * Records whether the reviewing doctor confirms or refutes the AI diagnosis.
 */
function DoctorVerdictCard({ verdict, verdictAt, note, onVerdict }) {
  const [saving, setSaving] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(note || '');
  const [error, setError] = useState(null);

  const record = async (value, noteOverride) => {
    setSaving(true);
    setError(null);
    try {
      await onVerdict(value, noteOverride);
      setEditingNote(false);
    } catch (err) {
      setError('Could not record the verdict. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveNote = async () => {
    if (!verdict) return;
    await record(verdict, noteDraft.trim() || undefined);
  };

  return (
    <div className="glass-card" style={{ marginTop: '1.5rem', padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <ShieldCheck size={15} style={{ color: 'var(--accent-cyan)' }} />
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>Doctor Verdict — Calibration Ledger</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {verdict
              ? 'Your review is recorded below. Changing it updates the calibration curve.'
              : 'Record your review of this AI diagnosis. Verdicts are aggregated into an empirical calibration curve — “when the model says X%, doctors confirmed it Y%”.'}
          </div>
        </div>
        {verdict && (
          <span className={`badge ${verdict === 'confirmed' ? 'badge-confirmed' : 'badge-uncertain'}`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {verdict === 'confirmed' ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
            {verdict === 'confirmed' ? 'CONFIRMED' : 'DISAGREED'}
          </span>
        )}
      </div>

      {verdict ? (
        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {verdictAt && <>Reviewed {new Date(verdictAt).toLocaleString()}. </>}
            {note ? <em style={{ color: 'var(--text-muted)' }}>“{note}”</em> : 'No note attached.'}
          </div>
          {editingNote ? (
            <>
              <textarea
                className="form-input"
                style={{ fontSize: '0.8rem', minHeight: 60, resize: 'vertical' }}
                placeholder="Optional note (e.g. pathology pending, suspected artifact)"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-primary btn-sm" onClick={saveNote} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  {saving ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />} Save note
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingNote(false)} disabled={saving}>Cancel</button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setNoteDraft(note || ''); setEditingNote(true); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                <FileText size={13} /> {note ? 'Edit note' : 'Add note'}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => record(verdict === 'confirmed' ? 'refuted' : 'confirmed', note)}
                disabled={saving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                <RefreshCw size={13} /> Change to {verdict === 'confirmed' ? 'Disagree' : 'Confirm'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => record('confirmed')}
            disabled={saving}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            {saving ? <Loader2 className="animate-spin" size={13} /> : <CheckCircle size={13} />} Confirm diagnosis
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => record('refuted')}
            disabled={saving}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderColor: 'rgba(239,68,68,0.35)', color: '#fca5a5' }}
          >
            <AlertTriangle size={13} /> Disagree
          </button>
        </div>
      )}

      {error && <div className="alert alert-error" style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem' }}>{error}</div>}
    </div>
  );
}

export default function EnsembleResultPanel({ result, originalImage, onReset, doctorVerdict, doctorVerdictAt, doctorVerdictNote, onVerdict }) {
  const { user } = useAuthStore();
  const isDoc = user?.role === 'doctor';
  const ensemble = result?.ensemble;
  const [aiStatus, setAiStatus] = useState(null);

  // Live agent availability — which agents are configured on this deployment
  useEffect(() => {
    systemAPI.getAiStatus().then(res => setAiStatus(res.data)).catch(() => {});
  }, []);

  if (!ensemble) return null;

  const tumorInfo = TUMOR_COLORS[ensemble.final_tumor_type] || TUMOR_COLORS.notumor;
  const agreementConfig = AGREEMENT_CONFIG[ensemble.agreement_level] || AGREEMENT_CONFIG.uncertain;

  // Agents that failed on this scan (stored) + agents not configured (live status)
  const failedAgents = ensemble.failed_agents || [];
  const disabledAgents = aiStatus?.unavailable_agents || [];
  const unavailable = [...new Set([...failedAgents, ...disabledAgents])];
  const totalSlots = aiStatus?.total_agent_slots || null;

  return (
    <div className="animate-fade-in">
      {/* Uncertainty Warning */}
      {ensemble.uncertainty_flag && (
        <div className="alert-banner high" style={{ marginBottom: '1.5rem' }}>
          <AlertOctagon size={20} />
          <div>
            <strong>⚠️ AI Uncertainty — Mandatory Human Review Required</strong>
            <p style={{ fontSize: '0.85rem', marginTop: 4, color: 'var(--text-secondary)' }}>
              The AI agents could not reach strong consensus. A qualified radiologist must review
              this scan before any clinical decision is made.
            </p>
          </div>
        </div>
      )}

      {/* Main Result Card */}
      <div className="ensemble-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
              Multi-AI Ensemble Diagnosis
            </div>
            <h2 style={{ fontSize: '2rem', color: tumorInfo.color, marginBottom: 8, fontFamily: 'Space Grotesk' }}>
              {tumorInfo.label}
            </h2>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className={`badge ${agreementConfig.class}`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {agreementConfig.icon}
                {agreementConfig.label}
              </span>
              <span className={`badge badge-${ensemble.risk_level}`}>
                {ensemble.risk_level?.toUpperCase()} RISK
              </span>
              {ensemble.uncertainty_flag && (
                <span className="badge" style={{ background: 'rgba(245,158,11,0.2)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.3)' }}>
                  ⚠️ REVIEW REQUIRED
                </span>
              )}
            </div>
          </div>

          <ConsensusGauge
            agreementLevel={ensemble.agreement_level}
            confidence={ensemble.final_confidence}
          />
        </div>

        {/* Recommendation */}
        <div style={{
          marginTop: '1.5rem',
          padding: '1rem',
          background: `${tumorInfo.bg}`,
          border: `1px solid ${tumorInfo.color}33`,
          borderRadius: 'var(--radius-md)',
          borderLeft: `4px solid ${tumorInfo.color}`,
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: tumorInfo.color, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Clinical Recommendation
          </div>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {ensemble.recommendation}
          </p>
        </div>

        {/* Doctor Verdict — calibration ledger (doctor view only) */}
        {isDoc && typeof onVerdict === 'function' && (
          <DoctorVerdictCard
            verdict={doctorVerdict}
            verdictAt={doctorVerdictAt}
            note={doctorVerdictNote}
            onVerdict={onVerdict}
          />
        )}

        {/* Degraded-ensemble disclosure — some agents not configured on this deployment */}
        {disabledAgents.length > 0 && (
          <div className="alert-banner high" style={{ marginTop: '1.5rem' }}>
            <Info size={18} />
            <div>
              <strong>Degraded AI ensemble</strong>
              <p style={{ fontSize: '0.85rem', marginTop: 4, color: 'var(--text-secondary)' }}>
                {nameAgents(disabledAgents).join(' and ')} {disabledAgents.length > 1 ? 'are' : 'is'} not configured on
                this deployment — this analysis ran on the configured agent{ensemble.agents_count > 1 ? 's' : ''} only.
              </p>
            </div>
          </div>
        )}

        {/* Agent Votes Grid */}
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
            <Bot size={16} style={{ color: 'var(--accent-cyan)' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Individual AI Agent Votes ({ensemble.agents_count}{totalSlots ? ` of ${totalSlots}` : ''} agents)
            </span>
          </div>
          <div className="agent-votes-grid">
            {ensemble.agent_votes?.map((vote, i) => (
              <AgentVoteCard key={i} vote={vote} />
            ))}
          </div>
        </div>

        {/* Class Scores */}
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Weighted Class Scores
          </div>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {Object.entries(ensemble.class_scores || {})
              .sort(([, a], [, b]) => b - a)
              .map(([cls, score]) => {
                const info = TUMOR_COLORS[cls] || TUMOR_COLORS.notumor;
                return (
                  <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 100, fontSize: '0.8rem', color: info.color, fontWeight: 600, textTransform: 'capitalize' }}>
                      {info.label}
                    </div>
                    <div style={{ flex: 1, height: 8, background: 'var(--border-subtle)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        width: `${score * 100}%`,
                        height: '100%',
                        background: info.color,
                        borderRadius: 4,
                        transition: 'width 1s ease',
                      }} />
                    </div>
                    <div style={{ width: 45, textAlign: 'right', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      {(score * 100).toFixed(1)}%
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Scan Images */}
        {/* Scan Images */}
        {(originalImage || result.original_image_url || result.segmentation_image_url || (isDoc && (result.gradcam_image_url || result.gradcam_glioma_url || result.gradcam_meningioma_url || result.gradcam_pituitary_url))) && (
          <div style={{ marginTop: '1.5rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
              Visual Analysis
            </div>
            <div className="scan-viewer-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              {(originalImage || result.original_image_url) && (
                <div className="scan-image-card">
                  <img src={getImageUrl(originalImage || result.original_image_url)} alt="Original MRI" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border-subtle)', background: '#000', maxHeight: 200, objectFit: 'contain' }} />
                  <div className="scan-image-label" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4, textAlign: 'center' }}>Original MRI</div>
                </div>
              )}
              {result.segmentation_image_url && (
                <div className="scan-image-card">
                  <img src={getImageUrl(result.segmentation_image_url)} alt="Segmentation" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border-subtle)', background: '#000', maxHeight: 200, objectFit: 'contain' }} />
                  <div className="scan-image-label" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4, textAlign: 'center' }}>K-Means Segmentation</div>
                </div>
              )}

              {/* Doctor Only: Show multiple Grad-CAM channels side-by-side */}
              {isDoc && (result.gradcam_glioma_url || result.gradcam_meningioma_url || result.gradcam_pituitary_url) ? (
                <>
                  {result.gradcam_glioma_url && (
                    <div className="scan-image-card">
                      <img src={getImageUrl(result.gradcam_glioma_url)} alt="Grad-CAM Glioma" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border-accent)', background: '#000', maxHeight: 200, objectFit: 'contain' }} />
                      <div className="scan-image-label" style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600, marginTop: 4, textAlign: 'center' }}>Grad-CAM: Glioma</div>
                    </div>
                  )}
                  {result.gradcam_meningioma_url && (
                    <div className="scan-image-card">
                      <img src={getImageUrl(result.gradcam_meningioma_url)} alt="Grad-CAM Meningioma" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border-accent)', background: '#000', maxHeight: 200, objectFit: 'contain' }} />
                      <div className="scan-image-label" style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600, marginTop: 4, textAlign: 'center' }}>Grad-CAM: Meningioma</div>
                    </div>
                  )}
                  {result.gradcam_pituitary_url && (
                    <div className="scan-image-card">
                      <img src={getImageUrl(result.gradcam_pituitary_url)} alt="Grad-CAM Pituitary" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border-accent)', background: '#000', maxHeight: 200, objectFit: 'contain' }} />
                      <div className="scan-image-label" style={{ fontSize: '0.75rem', color: '#00d4ff', fontWeight: 600, marginTop: 4, textAlign: 'center' }}>Grad-CAM: Pituitary</div>
                    </div>
                  )}
                </>
              ) : (
                /* Fallback single Grad-CAM if multiple not generated yet (doctor view only) */
                isDoc && result.gradcam_image_url && (
                  <div className="scan-image-card">
                    <img src={getImageUrl(result.gradcam_image_url)} alt="Grad-CAM Primary" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border-subtle)', background: '#000', maxHeight: 200, objectFit: 'contain' }} />
                    <div className="scan-image-label" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4, textAlign: 'center' }}>Grad-CAM Primary</div>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* Performance stats */}
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            ⚡ Total latency: <span style={{ color: 'var(--accent-cyan)' }}>{ensemble.total_latency_ms?.toFixed(0)}ms</span>
          </div>
          {unavailable.length > 0 && (
            <div style={{ fontSize: '0.75rem', color: 'var(--accent-orange)' }}>
              ⚠️ Unavailable agents: {nameAgents(unavailable).join(', ')}
            </div>
          )}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="glass-card" style={{ marginTop: '1rem', borderColor: 'rgba(245,158,11,0.2)' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
          <AlertTriangle size={16} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            <strong style={{ color: '#f59e0b' }}>Medical Disclaimer:</strong> This AI analysis is a
            clinical decision-support tool only. All findings must be reviewed and verified by a
            qualified medical professional before informing any patient care decisions.
          </p>
        </div>
      </div>

      <button onClick={onReset} className="btn btn-secondary" style={{ marginTop: '1rem' }}>
        <RefreshCw size={16} />
        Analyze Another Scan
      </button>
    </div>
  );
}
