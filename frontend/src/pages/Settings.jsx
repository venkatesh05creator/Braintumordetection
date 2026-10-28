import React, { useState, useEffect } from 'react';
import {
  User, Shield, Lock, Bell, CheckCircle2, AlertCircle,
  Save, Eye, EyeOff, Activity, Cpu, Database, Check
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import { authAPI, systemAPI } from '../api/client';
import ThemeToggle from '../components/ThemeToggle';

export default function Settings() {
  const { user, fetchMe } = useAuthStore();
  
  // Profile state
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);

  // Password state
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [passSaving, setPassSaving] = useState(false);
  const [passMsg, setPassMsg] = useState(null);

  // System & AI state
  const [aiStatus, setAiStatus] = useState(null);
  const [loadingAi, setLoadingAi] = useState(true);

  // Notification toggles (saved to local preferences)
  const [notifyAlerts, setNotifyAlerts] = useState(() => {
    return localStorage.getItem('pref_notify_alerts') !== 'false';
  });
  const [notifyScans, setNotifyScans] = useState(() => {
    return localStorage.getItem('pref_notify_scans') !== 'false';
  });
  const [notifyMsg, setNotifyMsg] = useState(null);

  useEffect(() => {
    if (user?.full_name) {
      setFullName(user.full_name);
    }
  }, [user]);

  useEffect(() => {
    systemAPI.getAiStatus()
      .then(res => setAiStatus(res.data))
      .catch(() => {})
      .finally(() => setLoadingAi(false));
  }, []);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      await authAPI.updateProfile({ full_name: fullName.trim() });
      await fetchMe();
      setProfileMsg({ type: 'success', text: 'Profile updated successfully.' });
    } catch (err) {
      setProfileMsg({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to update profile.',
      });
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPassMsg(null);

    if (newPass !== confirmPass) {
      setPassMsg({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }

    if (newPass.length < 8 || !/[A-Z]/.test(newPass) || !/[0-9]/.test(newPass)) {
      setPassMsg({
        type: 'error',
        text: 'Password must be at least 8 characters long with at least one uppercase letter and one digit.',
      });
      return;
    }

    setPassSaving(true);
    try {
      await authAPI.changePassword({
        current_password: currentPass,
        new_password: newPass,
      });
      setPassMsg({ type: 'success', text: 'Password changed successfully.' });
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
    } catch (err) {
      setPassMsg({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to change password. Please verify your current password.',
      });
    } finally {
      setPassSaving(false);
    }
  };

  const handleNotificationToggle = (key, currentVal, setter) => {
    const nextVal = !currentVal;
    setter(nextVal);
    localStorage.setItem(key, String(nextVal));
    setNotifyMsg('Preferences saved.');
    setTimeout(() => setNotifyMsg(null), 2500);
  };

  const initials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.role === 'admin' ? 'AD' : user?.role === 'doctor' ? 'DR' : 'PT';

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }} className="animate-fade-in">
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#f8fafc' }}>
          Account &amp; System Settings
        </h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>
          Manage your personal clinical profile, credentials, security, and notification preferences.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.75rem' }}>
        {/* Profile Identity Card */}
        <div className="glass-panel" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: user?.role === 'doctor' ? 'rgba(13, 148, 136, 0.2)' : 'rgba(56, 189, 248, 0.2)',
              border: `2px solid ${user?.role === 'doctor' ? '#0d9488' : '#38bdf8'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.35rem',
              fontWeight: 700,
              color: user?.role === 'doctor' ? '#2dd4bf' : '#38bdf8',
            }}>
              {initials}
            </div>

            <div style={{ flex: 1, minWidth: '220px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: '#f8fafc' }}>
                  {user?.role === 'doctor' ? `Dr. ${user?.full_name}` : user?.full_name}
                </h2>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#94a3b8',
                }}>
                  {user?.role || 'User'}
                </span>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  background: 'rgba(13, 148, 136, 0.15)',
                  color: '#2dd4bf',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}>
                  <CheckCircle2 size={12} /> {user?.is_verified ? 'Verified Clinical' : 'Active Account'}
                </span>
              </div>
              <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.85rem' }}>
                {user?.email}
              </p>
            </div>
          </div>
        </div>

        {/* Profile Edit Form */}
        <div className="glass-panel" style={{ padding: '1.75rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f8fafc' }}>
            <User size={18} color="#0d9488" /> Clinical Profile Information
          </h3>

          {profileMsg && (
            <div style={{
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              fontSize: '0.85rem',
              marginBottom: '1.25rem',
              background: profileMsg.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(13, 148, 136, 0.15)',
              border: `1px solid ${profileMsg.type === 'error' ? 'rgba(239, 68, 68, 0.35)' : 'rgba(13, 148, 136, 0.35)'}`,
              color: profileMsg.type === 'error' ? '#fca5a5' : '#5eead4',
            }}>
              {profileMsg.text}
            </div>
          )}

          <form onSubmit={handleProfileSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>
                  Full Legal Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    background: 'rgba(2, 6, 23, 0.5)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '0.88rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>
                  Registered Email Address (Locked)
                </label>
                <input
                  type="email"
                  value={user?.email || ''}
                  disabled
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    background: 'rgba(2, 6, 23, 0.25)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '6px',
                    color: '#64748b',
                    fontSize: '0.88rem',
                    cursor: 'not-allowed',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={profileSaving}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.6rem 1.25rem',
                borderRadius: '6px',
                border: 'none',
                background: '#0d9488',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: profileSaving ? 'not-allowed' : 'pointer',
              }}
            >
              <Save size={15} /> {profileSaving ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        </div>

        {/* Change Password Card */}
        <div className="glass-panel" style={{ padding: '1.75rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f8fafc' }}>
            <Lock size={18} color="#0d9488" /> Password &amp; Credential Security
          </h3>

          {passMsg && (
            <div style={{
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              fontSize: '0.85rem',
              marginBottom: '1.25rem',
              background: passMsg.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(13, 148, 136, 0.15)',
              border: `1px solid ${passMsg.type === 'error' ? 'rgba(239, 68, 68, 0.35)' : 'rgba(13, 148, 136, 0.35)'}`,
              color: passMsg.type === 'error' ? '#fca5a5' : '#5eead4',
            }}>
              {passMsg.text}
            </div>
          )}

          <form onSubmit={handlePasswordSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>
                  Current Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    value={currentPass}
                    onChange={(e) => setCurrentPass(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '0.65rem 2.5rem 0.65rem 0.85rem',
                      background: 'rgba(2, 6, 23, 0.5)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '0.88rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', color: '#64748b',
                    }}
                  >
                    {showCurrentPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>
                  New Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    required
                    minLength={8}
                    placeholder="Min. 8 chars, 1 uppercase, 1 digit"
                    style={{
                      width: '100%',
                      padding: '0.65rem 2.5rem 0.65rem 0.85rem',
                      background: 'rgba(2, 6, 23, 0.5)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '0.88rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', color: '#64748b',
                    }}
                  >
                    {showNewPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    background: 'rgba(2, 6, 23, 0.5)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '0.88rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={passSaving}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.6rem 1.25rem',
                borderRadius: '6px',
                border: 'none',
                background: '#0d9488',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: passSaving ? 'not-allowed' : 'pointer',
              }}
            >
              <Lock size={15} /> {passSaving ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>

        {/* Clinical Notifications Preferences */}
        <div className="glass-panel" style={{ padding: '1.75rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f8fafc' }}>
            <Bell size={18} color="#0d9488" /> Clinical Notification Preferences
          </h3>

          {notifyMsg && (
            <div style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              marginBottom: '1rem',
              background: 'rgba(13, 148, 136, 0.15)',
              color: '#5eead4',
            }}>
              {notifyMsg}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'rgba(2, 6, 23, 0.3)', borderRadius: '6px' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#f8fafc' }}>
                  Urgent Escalation Alerts
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Receive immediate alerts when worsening symptom trends or critical findings are detected.
                </div>
              </div>
              <input
                type="checkbox"
                checked={notifyAlerts}
                onChange={() => handleNotificationToggle('pref_notify_alerts', notifyAlerts, setNotifyAlerts)}
                style={{ width: 18, height: 18, accentColor: '#0d9488', cursor: 'pointer' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'rgba(2, 6, 23, 0.3)', borderRadius: '6px' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#f8fafc' }}>
                  Scan &amp; Volumetry Completion
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Notify when multi-AI ensemble segmentation and tumor burden calculation complete.
                </div>
              </div>
              <input
                type="checkbox"
                checked={notifyScans}
                onChange={() => handleNotificationToggle('pref_notify_scans', notifyScans, setNotifyScans)}
                style={{ width: 18, height: 18, accentColor: '#0d9488', cursor: 'pointer' }}
              />
            </div>
          </div>
        </div>

        {/* AI & System Diagnostics */}
        <div className="glass-panel" style={{ padding: '1.75rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f8fafc' }}>
            <Cpu size={18} color="#0d9488" /> AI Diagnostics &amp; System Health
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div style={{ padding: '1rem', background: 'rgba(2, 6, 23, 0.4)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>AI Ensemble Mode</div>
              <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.92rem' }}>
                {loadingAi ? 'Checking...' : `${aiStatus?.agents_count || 1} of ${aiStatus?.total_agent_slots || 3} Active`}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#2dd4bf', marginTop: '0.25rem' }}>
                Local CV + Gemini Vision + ViT
              </div>
            </div>

            <div style={{ padding: '1rem', background: 'rgba(2, 6, 23, 0.4)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Volumetry Engine</div>
              <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.92rem' }}>
                3D NIfTI &amp; DICOM Ready
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                Voxel-accurate cubic cm volumetry
              </div>
            </div>

            <div style={{ padding: '1rem', background: 'rgba(2, 6, 23, 0.4)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Interface Appearance</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.4rem' }}>
                <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>Theme Mode</span>
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

