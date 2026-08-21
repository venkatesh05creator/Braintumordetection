import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Search, UserPlus, Check, X, Loader2, Mail } from 'lucide-react';
import { patientsAPI } from '../../api/client';

const RISK_COLORS = {
  critical: 'badge-critical',
  high: 'badge-high',
  medium: 'badge-medium',
  low: 'badge-low',
  unknown: 'badge-unknown',
};

export default function PatientList() {
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Connection management
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(null);

  const fetchConnectionsAndPatients = () => {
    setLoading(true);
    Promise.all([
      patientsAPI.list(),
      patientsAPI.getIncomingRequests().catch(() => ({ data: [] }))
    ]).then(([pRes, rRes]) => {
      setPatients(pRes.data);
      setIncomingRequests(rRes.data);
    })
    .catch(() => {})
    .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchConnectionsAndPatients();
  }, []);

  const handleRequestResponse = async (requestId, status) => {
    try {
      await patientsAPI.respondToRequest(requestId, status);
      // Remove from list locally
      setIncomingRequests(prev => prev.filter(r => r.id !== requestId));
      // Refresh patient list
      const res = await patientsAPI.list();
      setPatients(res.data);
    } catch (err) {
      alert(err.response?.data?.detail || "Action failed.");
    }
  };

  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteSuccess(null);
    try {
      const res = await patientsAPI.invitePatient(inviteEmail.trim());
      setInviteSuccess(res.data.message || "Invitation sent successfully!");
      setInviteEmail('');
      setTimeout(() => setInviteSuccess(null), 4000);
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to invite patient.");
    } finally {
      setInviting(false);
    }
  };

  const filtered = patients.filter(p =>
    p.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-fade-in">
      {/* Glass Page Header */}
      <div style={{
        background: 'rgba(168,85,247,0.05)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(168,85,247,0.14)',
        borderRadius: 20, padding: '1.5rem 2rem', marginBottom: '1.5rem',
        boxShadow: '0 0 40px rgba(168,85,247,0.06), 4px 4px 20px rgba(0,0,0,0.5)',
      }}>
        <h1 style={{ fontSize: '1.75rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Users size={26} color="var(--accent-purple)" />
          <span style={{ background: 'var(--gradient-purple)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>My Patients</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Risk-sorted patient list with AI-assessed status</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* Main Patient List Table — Glass Card */}
        <div style={{
          background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '1.5rem',
          boxShadow: '6px 6px 20px rgba(0,0,0,0.55), -3px -3px 12px rgba(255,255,255,0.04)',
        }}>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="form-input"
                style={{ paddingLeft: '2.25rem' }}
                placeholder="Search patients..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="badge badge-purple">{patients.length} connected</div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <Loader2 className="animate-spin" size={24} style={{ margin: '0 auto', color: 'var(--accent-cyan)' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              {search ? `No patients matching "${search}"` : 'No patients connected yet.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Patient Name</th>
                    <th>Tumor Type</th>
                    <th>Risk Level</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.full_name}</div>
                      </td>
                      <td style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                        {p.tumor_type || 'Not analyzed'}
                      </td>
                      <td>
                        <span className={`badge ${RISK_COLORS[p.risk_level]}`}>
                          {p.risk_level?.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <Link to={`/doctor/patients/${p.id}`} className="btn btn-secondary btn-sm">
                          View Profile
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Connections Management Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Incoming connection requests */}
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              Incoming Connection Requests
            </h3>
            {incomingRequests.length === 0 ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
                No pending patient connection requests.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {incomingRequests.map(req => (
                  <div key={req.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                    <div>
                      <strong style={{ fontSize: '0.85rem', display: 'block' }}>{req.patient_name}</strong>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(req.created_at).toLocaleDateString()}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button className="btn btn-primary btn-sm" style={{ padding: 4 }} onClick={() => handleRequestResponse(req.id, 'accepted')}>
                        <Check size={14} />
                      </button>
                      <button className="btn btn-secondary btn-sm" style={{ padding: 4 }} onClick={() => handleRequestResponse(req.id, 'declined')}>
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Invite patient by email */}
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <UserPlus size={16} /> Invite Patient
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.4 }}>
              Enter a registered patient's email address below to send them an invitation to link accounts.
            </p>
            <form onSubmit={handleInviteSubmit}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <div style={{ position: 'relative' }}>
                  <Mail size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="email"
                    className="form-input"
                    style={{ paddingLeft: '2rem', fontSize: '0.85rem' }}
                    placeholder="patient@email.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              {inviteSuccess && (
                <div style={{ color: 'var(--accent-green)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                  {inviteSuccess}
                </div>
              )}
              <button type="submit" className="btn btn-primary w-full btn-sm" disabled={inviting}>
                {inviting ? 'Sending invitation...' : 'Send Invitation'}
              </button>
            </form>
          </div>

        </div>

      </div>
    </div>
  );
}
