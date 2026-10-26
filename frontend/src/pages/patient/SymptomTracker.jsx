import React, { useEffect, useState } from 'react';
import { Activity, TrendingUp, AlertTriangle, Shield, Check, Calendar } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis
} from 'recharts';
import { symptomsAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { SYMPTOMS, getSymptomLevelText } from '../../constants/symptoms';

export default function SymptomTracker() {
  const { user } = useAuthStore();
  const [values, setValues] = useState(Object.fromEntries(SYMPTOMS.map(s => [s.key, 0])));
  const [notes, setNotes] = useState('');
  const [history, setHistory] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const patientId = user?.patient_id;

  useEffect(() => {
    if (patientId) {
      symptomsAPI.getHistory(patientId, 14)
        .then(res => setHistory(res.data))
        .catch(() => {});
    }
  }, [patientId]);

  const totalScore = Math.round(
    SYMPTOMS.reduce((sum, s) => sum + values[s.key], 0) / (SYMPTOMS.length * 10) * 100
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!patientId) {
      setError("Unable to find patient ID. Try logging in again.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await symptomsAPI.create({
        patient_id: patientId,
        log_date: new Date().toISOString().split('T')[0],
        ...values,
        patient_notes: notes,
      });
      setSubmitted(true);
      const res = await symptomsAPI.getHistory(patientId, 14);
      setHistory(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const radarData = SYMPTOMS.map(s => ({ subject: s.label.split(' ')[0], value: values[s.key] }));

  return (
    <div className="animate-fade-in">
      {/* Glass Page Header */}
      <div style={{
        background: 'rgba(249,115,22,0.05)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(249,115,22,0.14)',
        borderRadius: 20, padding: '1.5rem 2rem', marginBottom: '1.5rem',
        boxShadow: '0 0 40px rgba(249,115,22,0.06), 4px 4px 20px rgba(0,0,0,0.5)',
      }}>
        <h1 style={{ fontSize: '1.75rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Activity size={26} color="var(--accent-orange)" />
          <span style={{ background: 'linear-gradient(135deg, var(--accent-orange), #fbbf24)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Daily Symptom Tracker</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: 8 }}>Rate your neurological symptoms (0 = None, 10 = Severe). Your clinical team receives these logs in real-time.</p>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700 }}>Scale:</span>
          <span><strong style={{ color: 'var(--accent-green)' }}>0</strong>: None</span>
          <span>·</span><span><strong style={{ color: 'var(--accent-cyan)' }}>1-3</strong>: Mild</span>
          <span>·</span><span><strong style={{ color: 'var(--accent-orange)' }}>4-6</strong>: Moderate</span>
          <span>·</span><span><strong style={{ color: 'var(--accent-red)' }}>7-9</strong>: Severe</span>
          <span>·</span><span><strong style={{ color: '#dc2626' }}>10</strong>: Extreme</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '1.5rem', alignItems: 'start', flexWrap: 'wrap' }}>
        
        {/* Form Container — Glass Card */}
        <div style={{
          background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '1.75rem',
          boxShadow: '6px 6px 20px rgba(0,0,0,0.55), -3px -3px 12px rgba(255,255,255,0.04)',
        }}>
          {submitted ? (
            <div style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
              <div style={{
                width: 60, height: 60, borderRadius: '50%',
                background: 'var(--accent-cyan-dim)',
                border: '2px solid var(--accent-cyan)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 1.5rem',
                color: 'var(--accent-cyan)'
              }}>
                <Check size={28} />
              </div>
              <h3 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Daily Symptoms Logged</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', maxWidth: 400, margin: '0 auto 1.5rem' }}>Your data has been successfully updated on the doctor portal. Continuous tracking helps refine diagnostic suggestions.</p>
              <button className="btn btn-secondary" onClick={() => setSubmitted(false)}>
                Log Again
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>Today's Severity Checklist</h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {SYMPTOMS.map((symptom) => (
                  <div key={symptom.key} style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ width: 140, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{symptom.label}</div>
                    <input
                      type="range" min={0} max={10} step={1}
                      value={values[symptom.key]}
                      onChange={(e) => setValues({ ...values, [symptom.key]: +e.target.value })}
                      style={{ flex: 1, accentColor: symptom.color, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.05)' }}
                    />
                    <div style={{ color: symptom.color, minWidth: 110, fontSize: '0.8rem', fontWeight: 700, textAlign: 'right' }}>
                      {values[symptom.key]} · {getSymptomLevelText(values[symptom.key])}
                    </div>
                  </div>
                ))}
              </div>

              <div className="form-group" style={{ marginTop: '1.75rem' }}>
                <label className="form-label">Patient Notes / Contextual Details</label>
              <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Describe headaches, visual disruptions, memory issues or specific triggers..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>

              {error && (
                <div style={{ color: 'var(--accent-red)', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</div>
              )}

              <button type="submit" className="btn btn-primary w-full" style={{ background: 'var(--accent-cyan)', color: '#090c13' }} disabled={submitting}>
                {submitting ? 'Saving Daily Log...' : 'Submit Daily Log'}
              </button>
            </form>
          )}
        </div>

        {/* Severity Gauge Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Daily Score Circle Gauge — Neumorphic */}
          <div style={{
            background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, padding: '1.5rem',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            boxShadow: '5px 5px 16px rgba(0,0,0,0.55), -3px -3px 10px rgba(255,255,255,0.04)',
          }}>
            <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>Calculated Index</h4>
            
            <div style={{
              width: 110, height: 110, borderRadius: '50%',
              background: 'var(--neu-base)',
              boxShadow: `8px 8px 20px rgba(0,0,0,0.65), -4px -4px 12px rgba(255,255,255,0.05), inset 0 0 20px ${totalScore > 60 ? 'rgba(239,68,68,0.08)' : totalScore > 30 ? 'rgba(245,158,11,0.08)' : 'rgba(0,229,200,0.08)'}`,
              border: `2px solid ${totalScore > 60 ? 'rgba(239,68,68,0.30)' : totalScore > 30 ? 'rgba(245,158,11,0.30)' : 'rgba(0,229,200,0.30)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', marginBottom: '1rem',
            }}>
              <span style={{ fontSize: '1.7rem', fontWeight: 900, fontFamily: 'Space Grotesk', color: totalScore > 60 ? 'var(--accent-red)' : totalScore > 30 ? 'var(--accent-orange)' : 'var(--accent-cyan)' }}>{totalScore}%</span>
            </div>
            
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Overall Severity Load</div>
          </div>

          {/* Mini Radar Chart — Glass */}
          <div style={{
            background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, padding: '1.25rem',
            boxShadow: '5px 5px 16px rgba(0,0,0,0.55), -3px -3px 10px rgba(255,255,255,0.04)',
          }}>
            <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.75rem', textAlign: 'center' }}>Symptom Distribution</h4>
            <ResponsiveContainer width="100%" height={160}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(255,255,255,0.03)" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                <Radar dataKey="value" stroke="var(--accent-cyan)" fill="var(--accent-cyan)" fillOpacity={0.12} dot={false} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

        </div>

      </div>

      {/* History Line Chart — Glass Card */}
      {history.length > 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, padding: '1.5rem', marginTop: '1.5rem',
          boxShadow: '6px 6px 20px rgba(0,0,0,0.55), -3px -3px 12px rgba(255,255,255,0.04)',
        }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '1.25rem' }}>14-Day Longitudinal Severity Trend</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <XAxis dataKey="log_date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={d => d.slice(5)} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{ background: '#121620', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--text-primary)' }}
              />
              <Line
                type="monotone"
                dataKey="severity_score"
                stroke="var(--accent-cyan)"
                strokeWidth={2}
                dot={{ fill: 'var(--accent-cyan)', r: 3 }}
                name="Severity Index"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
