import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Brain, LayoutDashboard, Upload, FileText, Activity,
  Users, MessageSquare, Bell, LogOut, Shield, Settings
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import useAlertsStore from '../store/alertsStore';
import { patientsAPI, systemAPI } from '../api/client';
import ThemeToggle from './ThemeToggle';

const AGENT_NAMES = {
  gemini_vision: 'Gemini Vision',
  huggingface_vit: 'HuggingFace ViT',
  local_cv: 'Local CV',
};

const patientNav = [
  { to: '/patient', icon: <LayoutDashboard size={17} />, label: 'Dashboard', end: true },
  { to: '/patient/scan', icon: <Upload size={17} />, label: 'Upload MRI Scan' },
  { to: '/patient/reports', icon: <FileText size={17} />, label: 'My Reports' },
  { to: '/patient/symptoms', icon: <Activity size={17} />, label: 'Symptom Tracker' },
  { to: '/patient/chatbot', icon: <Brain size={17} />, label: 'AI Assistant' },
  { to: '/patient/messages', icon: <MessageSquare size={17} />, label: 'Clinical Chat' },
];

const doctorNav = [
  { to: '/doctor', icon: <LayoutDashboard size={17} />, label: 'Dashboard', end: true },
  { to: '/doctor/patients', icon: <Users size={17} />, label: 'Patients' },
  { to: '/doctor/messages', icon: <MessageSquare size={17} />, label: 'Clinical Chat' },
  { to: '/doctor/chatbot', icon: <Brain size={17} />, label: 'AI Assistant' },
];

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { unreadCount, fetchUnread } = useAlertsStore();
  const [patientCount, setPatientCount] = useState(0);
  const [aiStatus, setAiStatus] = useState(null);

  useEffect(() => {
    if (user?.role === 'doctor') {
      patientsAPI.list().then(res => setPatientCount(res.data.length)).catch(() => {});
      fetchUnread();
    }
  }, [user]);

  // Live AI ensemble availability (which agents are configured on this deployment)
  useEffect(() => {
    systemAPI.getAiStatus().then(res => setAiStatus(res.data)).catch(() => {});
  }, []);

  const aiAgents = aiStatus?.agents_count;
  const aiTotal = aiStatus?.total_agent_slots;
  let aiLabel = 'AI Status …';
  let aiColor = 'var(--text-muted)';
  if (aiStatus) {
    if (aiAgents === aiTotal) {
      aiLabel = 'AI Ensemble Online';
      aiColor = 'var(--accent-cyan)';
    } else if (aiAgents === 1) {
      aiLabel = 'Local CV Only';
      aiColor = '#f59e0b';
    } else {
      aiLabel = `${aiAgents} Agents Online`;
      aiColor = 'var(--accent-cyan)';
    }
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = user?.role === 'doctor' ? doctorNav : patientNav;
  const initials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.role === 'doctor' ? 'DR' : 'PT';

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Brain size={20} color="#ffffff" />
        </div>
        <div>
          <div className="sidebar-logo-text">NeuroAI</div>
          <div className="sidebar-logo-sub">DIAGNOSTIC SUITE</div>
        </div>
      </div>

      {/* Profile Card — Glass */}
      <div className="sidebar-profile-card">
        <div className="sidebar-profile-avatar">{initials}</div>
        <div className="sidebar-profile-info" style={{ flex: 1, minWidth: 0 }}>
          <div className="sidebar-profile-name">
            {user?.role === 'doctor' ? `Dr. ${user.full_name}` : user?.full_name}
          </div>
          <div className="sidebar-profile-sub">
            {user?.role === 'doctor' ? '🏥 Neuro-Oncology' : '🩺 Patient Portal'}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="section-header" style={{ paddingLeft: '0.5rem' }}>Navigation</div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.label + item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
            {item.label === 'Patients' && patientCount > 0 && (
              <span className="sidebar-badge">{patientCount}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom Section */}
      <div style={{
        marginTop: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        paddingTop: '1rem',
        borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div className="section-header" style={{ paddingLeft: '0.5rem' }}>System</div>

        {user?.role === 'doctor' && (
          <NavLink
            to="/doctor/notifications"
            className="nav-item"
            style={{ padding: '0.5rem 0.75rem', fontSize: '0.82rem' }}
          >
            <span className="nav-icon"><Bell size={15} /></span>
            Notifications
            {unreadCount > 0 && (
              <span className={`sidebar-badge ${unreadCount > 3 ? 'critical' : ''}`} style={{ marginLeft: 'auto' }}>
                {unreadCount}
              </span>
            )}
          </NavLink>
        )}

        <button
          onClick={() => {}}
          className="nav-item"
          style={{ width: '100%', cursor: 'pointer', border: 'none', background: 'none', padding: '0.5rem 0.75rem', fontSize: '0.82rem', textAlign: 'left' }}
        >
          <span className="nav-icon"><Settings size={15} /></span>
          Settings
        </button>

        <div
          className="nav-item"
          style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.5rem 0.75rem', fontSize: '0.82rem' }}
        >
          <span className="nav-icon"><Settings size={15} /></span>
          <span style={{ flex: 1 }}>Theme</span>
          <ThemeToggle />
        </div>

        {/* AI Status indicators — live from /api/system/ai-status */}
        <div style={{
          padding: '0.6rem 0.75rem',
          background: 'rgba(0,229,200,0.05)',
          border: '1px solid rgba(0,229,200,0.10)',
          borderRadius: 'var(--radius-sm)',
          display: 'flex', flexDirection: 'column', gap: 5,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="pulse-dot" style={{ width: 6, height: 6, background: aiColor }} />
            <span style={{ fontSize: '0.68rem', color: aiColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {aiLabel}
            </span>
          </div>
          {aiStatus && aiStatus.unavailable_agents.length > 0 && (
            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              {aiStatus.unavailable_agents.map(id => AGENT_NAMES[id] || id).join(', ')} not configured
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Shield size={10} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>HIPAA Compliant</span>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="nav-item"
          style={{
            width: '100%', cursor: 'pointer', border: 'none', background: 'none',
            color: 'var(--accent-red)', padding: '0.5rem 0.75rem', textAlign: 'left',
            fontSize: '0.85rem',
          }}
        >
          <LogOut size={15} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
