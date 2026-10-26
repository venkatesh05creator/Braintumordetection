import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, Activity, Brain, FileText, Info, CheckCheck,
  ArrowRight, BellOff, Loader2, ShieldAlert
} from 'lucide-react';
import { alertsAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import useAlertsStore from '../../store/alertsStore';
import useSocket from '../../hooks/useSocket';

const SEVERITY_CONFIG = {
  critical: { color: 'var(--accent-red)', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.35)', label: 'Critical', badge: 'badge-critical' },
  high: { color: 'var(--accent-orange)', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.30)', label: 'High', badge: 'badge-high' },
  medium: { color: 'var(--accent-amber)', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.30)', label: 'Medium', badge: 'badge-medium' },
  low: { color: 'var(--text-secondary)', bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.12)', label: 'Low', badge: 'badge-low' },
};

const TYPE_CONFIG = {
  symptom_spike: { icon: <Activity size={18} />, color: 'var(--accent-red)' },
  ai_uncertainty: { icon: <Brain size={18} />, color: 'var(--accent-purple)' },
  scan_complete: { icon: <FileText size={18} />, color: 'var(--accent-cyan)' },
  system: { icon: <Info size={18} />, color: 'var(--text-secondary)' },
};

const timeAgo = (iso) => {
  if (!iso) return '';
  const then = new Date(iso);
  const diffSec = Math.max(0, (Date.now() - then.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function Notifications() {
  const { user } = useAuthStore();
  const { unreadCount, fetchUnread, setUnreadCount } = useAlertsStore();
  const navigate = useNavigate();

  const [alerts, setAlerts] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all' | 'unread'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [acknowledging, setAcknowledging] = useState(null); // alert_id
  const [ackAllLoading, setAckAllLoading] = useState(false);

  const isDoctor = user?.role === 'doctor';

  const loadAlerts = useCallback(async () => {
    if (!isDoctor) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await alertsAPI.list();
      setAlerts(res.data);
      await fetchUnread();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load alerts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [isDoctor, fetchUnread]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  // Live push: monitoring emits `new_alert` to the doctor's socket room
  useSocket({
    new_alert: (payload) => {
      if (!payload?.alert_id) return;
      setAlerts((prev) => {
        if (prev.some((a) => a.alert_id === payload.alert_id)) return prev;
        return [{
          alert_id: payload.alert_id,
          patient_id: payload.patient_id,
          patient_name: payload.patient_name || 'Patient',
          severity: payload.severity,
          alert_type: 'symptom_spike',
          title: payload.title,
          message: payload.message,
          trigger_reason: payload.trigger_reason,
          is_acknowledged: false,
          created_at: new Date().toISOString(),
        }, ...prev];
      });
      setUnreadCount(unreadCount + 1);
    },
  });

  const handleAcknowledge = async (alertId) => {
    setAcknowledging(alertId);
    try {
      await alertsAPI.acknowledge(alertId);
      setAlerts((prev) => prev.map((a) => a.alert_id === alertId ? { ...a, is_acknowledged: true } : a));
      setUnreadCount(Math.max(0, unreadCount - 1));
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to acknowledge alert.');
    } finally {
      setAcknowledging(null);
    }
  };

  const handleAcknowledgeAll = async () => {
    setAckAllLoading(true);
    setError(null);
    try {
      await alertsAPI.acknowledgeAll();
      setAlerts((prev) => prev.map((a) => ({ ...a, is_acknowledged: true })));
      setUnreadCount(0);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to acknowledge alerts.');
    } finally {
      setAckAllLoading(false);
    }
  };

  const visibleAlerts = filter === 'unread' ? alerts.filter((a) => !a.is_acknowledged) : alerts;
  const unreadVisible = alerts.filter((a) => !a.is_acknowledged).length;

  return (
    <div className="animate-fade-in">
      {/* Page Header — Glass Banner */}
      <div style={{
        background: 'rgba(239,68,68,0.04)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(239,68,68,0.14)',
        borderRadius: 20,
        padding: '1.5rem 2rem',
        marginBottom: '1.5rem',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem',
        boxShadow: '0 0 40px rgba(239,68,68,0.05), 4px 4px 20px rgba(0,0,0,0.5)',
      }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Bell size={26} color="var(--accent-red)" />
            <span style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Notifications & Alerts</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Escalation alerts from your patients' symptom monitoring and AI analysis
          </p>
        </div>
        {unreadVisible > 0 && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleAcknowledgeAll}
            disabled={ackAllLoading}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {ackAllLoading ? <Loader2 className="animate-spin" size={14} /> : <CheckCheck size={14} />}
            Mark all as read
          </button>
        )}
      </div>

      {/* Filter Tabs + Unread Summary */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div className="glass-tabs" style={{ width: 'fit-content' }}>
          {[
            { id: 'all', label: `All (${alerts.length})` },
            { id: 'unread', label: `Unread (${unreadVisible})` },
          ].map((tab) => (
            <button
              key={tab.id}
              className={`glass-tab ${filter === tab.id ? 'active' : ''}`}
              style={{ flex: 'none', padding: '0.45rem 1.25rem' }}
              onClick={() => setFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          <span className="pulse-dot" style={{ width: 6, height: 6 }} />
          Live updates enabled
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>
      )}

      {/* Alert List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <Loader2 className="animate-spin" size={32} style={{ margin: '0 auto', color: 'var(--accent-cyan)' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '1rem' }}>Loading alerts...</p>
        </div>
      ) : visibleAlerts.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
            {filter === 'unread' ? <CheckCheck size={32} style={{ color: 'var(--accent-green)' }} /> : <BellOff size={32} style={{ color: 'var(--text-muted)' }} />}
          </div>
          <h3 style={{ marginBottom: 6 }}>
            {filter === 'unread' ? 'No unread alerts' : 'No alerts yet'}
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', maxWidth: 420, margin: '0 auto' }}>
            {filter === 'unread'
              ? 'You are all caught up. New escalation alerts will appear here in real time.'
              : 'Escalation alerts appear here when symptom monitoring or the AI ensemble flags a patient for review.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {visibleAlerts.map((alert) => {
            const sev = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.low;
            const type = TYPE_CONFIG[alert.alert_type] || TYPE_CONFIG.system;
            return (
              <div
                key={alert.alert_id}
                className="glass-card"
                style={{
                  padding: '1.1rem 1.25rem',
                  borderLeft: `4px solid ${alert.is_acknowledged ? 'rgba(255,255,255,0.12)' : sev.color}`,
                  background: alert.is_acknowledged ? 'rgba(255,255,255,0.02)' : sev.bg,
                  opacity: alert.is_acknowledged ? 0.72 : 1,
                  cursor: 'pointer',
                }}
                onClick={() => navigate(`/doctor?patientId=${alert.patient_id}`)}
              >
                <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'flex-start' }}>
                  {/* Type icon */}
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                    background: sev.bg, border: `1px solid ${sev.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: sev.color,
                  }}>
                    {type.icon}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {!alert.is_acknowledged && (
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: sev.color, boxShadow: `0 0 8px ${sev.color}`, flexShrink: 0 }} />
                      )}
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{alert.title}</span>
                      <span className={`badge ${sev.badge}`} style={{ fontSize: '0.62rem', padding: '1px 7px' }}>{sev.label}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 'auto', flexShrink: 0 }}>
                        {timeAgo(alert.created_at)}
                      </span>
                    </div>

                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.6 }}>
                      {alert.message}
                    </p>

                    {alert.trigger_reason && (
                      <div style={{
                        marginTop: 8, padding: '0.5rem 0.75rem', borderRadius: 8,
                        background: 'var(--overlay-soft)', border: '1px solid var(--border-subtle)',
                        fontSize: '0.78rem', color: 'var(--text-secondary)', fontFamily: 'monospace',
                      }}>
                        {alert.trigger_reason}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <ArrowRight size={12} /> View patient record
                      </span>
                      {!alert.is_acknowledged && (
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ marginLeft: 'auto', fontSize: '0.75rem', padding: '0.3rem 0.9rem' }}
                          disabled={acknowledging === alert.alert_id}
                          onClick={(e) => { e.stopPropagation(); handleAcknowledge(alert.alert_id); }}
                        >
                          {acknowledging === alert.alert_id
                            ? <Loader2 className="animate-spin" size={12} />
                            : <CheckCheck size={13} />}
                          Acknowledge
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Disclaimer */}
      <div className="glass-card" style={{ marginTop: '1.5rem', borderColor: 'rgba(245,158,11,0.2)' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
          <ShieldAlert size={16} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            <strong style={{ color: '#f59e0b' }}>Clinical Note:</strong> Acknowledging an alert records it as reviewed.
            Symptom-escalation alerts are generated automatically when a patient's logged severity rises
            significantly over consecutive days — always correlate with the patient's full record before acting.
          </p>
        </div>
      </div>

    </div>
  );
}
