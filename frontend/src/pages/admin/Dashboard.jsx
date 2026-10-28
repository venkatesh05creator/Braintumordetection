import React, { useEffect, useState } from 'react';
import {
  Shield, UserCheck, Users, Activity, FileText,
  CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  Search
} from 'lucide-react';
import { adminAPI } from '../../api/client';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('verification');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, usersRes, auditRes] = await Promise.all([
        adminAPI.getStats(),
        adminAPI.listUsers(),
        adminAPI.getAuditLogs(50),
      ]);
      setStats(statsRes.data);
      setUsers(usersRes.data);
      setAuditLogs(auditRes.data);
    } catch (err) {
      setNotification({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to load administrator records.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleVerifyDoctor = async (doctorId, approve) => {
    setActionLoading(true);
    try {
      await adminAPI.verifyDoctor(doctorId, approve);
      setNotification({
        type: 'success',
        message: approve ? 'Doctor verified and authorized for clinical review.' : 'Doctor verification revoked.',
      });
      await loadData();
    } catch (err) {
      setNotification({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to update verification status.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleActive = async (userId, currentActive) => {
    setActionLoading(true);
    try {
      await adminAPI.updateUserStatus(userId, !currentActive);
      setNotification({
        type: 'success',
        message: `User account ${!currentActive ? 'activated' : 'deactivated'}.`,
      });
      await loadData();
    } catch (err) {
      setNotification({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to toggle account status.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const pendingDoctors = users.filter(u => u.role === 'doctor' && !u.is_verified);
  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.role?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto', color: '#e2e8f0' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #0d9488 0%, #0369a1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)',
            }}>
              <Shield size={20} color="#ffffff" />
            </div>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                Platform Governance & Security Portal
              </h1>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                Credential verification, access policy enforcement, and immutable audit logs.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={loadData}
          disabled={loading || actionLoading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '6px',
            color: '#38bdf8',
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={15} className={loading ? 'spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Notifications */}
      {notification && (
        <div style={{
          marginBottom: '1.5rem',
          padding: '0.85rem 1.25rem',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: notification.type === 'error' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(13, 148, 136, 0.15)',
          border: `1px solid ${notification.type === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(13, 148, 136, 0.35)'}`,
          color: notification.type === 'error' ? '#fca5a5' : '#5eead4',
          fontSize: '0.9rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            {notification.type === 'error' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        <div style={{
          background: 'rgba(15, 23, 42, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          padding: '1.25rem',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Users</span>
            <Users size={18} color="#0284c7" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f8fafc' }}>
            {stats?.total_users ?? users.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            Patients & Clinicians registered
          </div>
        </div>

        <div style={{
          background: 'rgba(15, 23, 42, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          padding: '1.25rem',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Verified Specialists</span>
            <UserCheck size={18} color="#0d9488" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#2dd4bf' }}>
            {stats?.verified_doctors ?? users.filter(u => u.role === 'doctor' && u.is_verified).length}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            Authorized for diagnosis and consults
          </div>
        </div>

        <div style={{
          background: 'rgba(15, 23, 42, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          padding: '1.25rem',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending Doctors</span>
            <AlertTriangle size={18} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: pendingDoctors.length > 0 ? '#f59e0b' : '#94a3b8' }}>
            {pendingDoctors.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            Awaiting credential verification
          </div>
        </div>

        <div style={{
          background: 'rgba(15, 23, 42, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          padding: '1.25rem',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Security Audits</span>
            <FileText size={18} color="#0ea5e9" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#38bdf8' }}>
            {stats?.audit_logs_total ?? auditLogs.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            Immutable events captured
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        marginBottom: '1.5rem',
      }}>
        <button
          onClick={() => setActiveTab('verification')}
          style={{
            padding: '0.65rem 1.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'verification' ? '2px solid #0d9488' : '2px solid transparent',
            color: activeTab === 'verification' ? '#2dd4bf' : '#94a3b8',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <UserCheck size={16} />
          Doctor Verification Queue ({pendingDoctors.length})
        </button>
        <button
          onClick={() => setActiveTab('users')}
          style={{
            padding: '0.65rem 1.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'users' ? '2px solid #0d9488' : '2px solid transparent',
            color: activeTab === 'users' ? '#2dd4bf' : '#94a3b8',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Users size={16} />
          User Governance ({users.length})
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          style={{
            padding: '0.65rem 1.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'audit' ? '2px solid #0d9488' : '2px solid transparent',
            color: activeTab === 'audit' ? '#2dd4bf' : '#94a3b8',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Activity size={16} />
          System Audit Trail
        </button>
      </div>

      {/* Tab 1: Doctor Verification Queue */}
      {activeTab === 'verification' && (
        <div style={{
          background: 'rgba(15, 23, 42, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          overflow: 'hidden',
        }}>
          {pendingDoctors.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
              <CheckCircle2 size={40} color="#0d9488" style={{ marginBottom: '0.75rem' }} />
              <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc' }}>Verification Queue Clear</div>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem' }}>
                All registered medical practitioners currently hold valid verification.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(2, 6, 23, 0.5)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8' }}>
                    <th style={{ padding: '0.85rem 1.25rem' }}>Practitioner Name</th>
                    <th style={{ padding: '0.85rem 1.25rem' }}>Email</th>
                    <th style={{ padding: '0.85rem 1.25rem' }}>License / ID</th>
                    <th style={{ padding: '0.85rem 1.25rem' }}>Registered At</th>
                    <th style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingDoctors.map((doc) => (
                    <tr key={doc.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <td style={{ padding: '1rem 1.25rem', fontWeight: 600, color: '#f8fafc' }}>
                        Dr. {doc.full_name}
                      </td>
                      <td style={{ padding: '1rem 1.25rem', color: '#94a3b8' }}>{doc.email}</td>
                      <td style={{ padding: '1rem 1.25rem', color: '#38bdf8' }}>
                        {doc.medical_license_id || 'Self-Declared Candidate'}
                      </td>
                      <td style={{ padding: '1rem 1.25rem', color: '#94a3b8' }}>
                        {new Date(doc.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => handleVerifyDoctor(doc.id, true)}
                            disabled={actionLoading}
                            style={{
                              padding: '0.4rem 0.85rem',
                              background: '#0d9488',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '5px',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                            }}
                          >
                            <CheckCircle2 size={14} />
                            Approve
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: User Governance */}
      {activeTab === 'users' && (
        <div style={{
          background: 'rgba(15, 23, 42, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          overflow: 'hidden',
        }}>
          {/* Search Box */}
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Search size={16} color="#64748b" />
            <input
              type="text"
              placeholder="Search by name, email, or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                color: '#f8fafc',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'rgba(2, 6, 23, 0.5)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8' }}>
                  <th style={{ padding: '0.85rem 1.25rem' }}>User</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Role</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Verification</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Account Status</th>
                  <th style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <td style={{ padding: '0.9rem 1.25rem' }}>
                      <div style={{ fontWeight: 600, color: '#f8fafc' }}>{u.full_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{u.email}</div>
                    </td>
                    <td style={{ padding: '0.9rem 1.25rem' }}>
                      <span style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        background: u.role === 'admin' ? 'rgba(56, 189, 248, 0.15)' : u.role === 'doctor' ? 'rgba(13, 148, 136, 0.2)' : 'rgba(148, 163, 184, 0.15)',
                        color: u.role === 'admin' ? '#38bdf8' : u.role === 'doctor' ? '#2dd4bf' : '#cbd5e1',
                      }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: '0.9rem 1.25rem' }}>
                      {u.role === 'doctor' ? (
                        u.is_verified ? (
                          <span style={{ color: '#2dd4bf', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                            <CheckCircle2 size={14} /> Verified
                          </span>
                        ) : (
                          <span style={{ color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                            <AlertTriangle size={14} /> Pending
                          </span>
                        )
                      ) : (
                        <span style={{ color: '#64748b' }}>N/A</span>
                      )}
                    </td>
                    <td style={{ padding: '0.9rem 1.25rem' }}>
                      <span style={{
                        color: u.is_active ? '#2dd4bf' : '#f87171',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}>
                        {u.is_active ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                        {u.is_active ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td style={{ padding: '0.9rem 1.25rem', textAlign: 'right' }}>
                      <button
                        onClick={() => handleToggleActive(u.id, u.is_active)}
                        disabled={actionLoading || u.role === 'admin'}
                        style={{
                          padding: '0.35rem 0.75rem',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '4px',
                          color: u.is_active ? '#fca5a5' : '#2dd4bf',
                          fontSize: '0.75rem',
                          cursor: u.role === 'admin' ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: System Audit Trail */}
      {activeTab === 'audit' && (
        <div style={{
          background: 'rgba(15, 23, 42, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          overflow: 'hidden',
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'rgba(2, 6, 23, 0.5)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8' }}>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Timestamp</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Action</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Actor</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Resource</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <td style={{ padding: '0.85rem 1.25rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.85rem 1.25rem' }}>
                      <span style={{
                        padding: '0.2rem 0.45rem',
                        borderRadius: '3px',
                        background: 'rgba(13, 148, 136, 0.15)',
                        color: '#2dd4bf',
                        fontFamily: 'monospace',
                        fontSize: '0.78rem',
                      }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ padding: '0.85rem 1.25rem', color: '#f8fafc' }}>
                      {log.user_email || `User #${log.user_id || 'System'}`}
                    </td>
                    <td style={{ padding: '0.85rem 1.25rem', color: '#cbd5e1' }}>
                      {log.resource_type ? `${log.resource_type}:${log.resource_id || ''}` : 'System'}
                    </td>
                    <td style={{ padding: '0.85rem 1.25rem', color: '#64748b', fontFamily: 'monospace' }}>
                      {log.ip_address || '127.0.0.1'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
