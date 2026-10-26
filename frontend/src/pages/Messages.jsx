import React, { useEffect, useState, useRef } from 'react';
import useAuthStore from '../store/authStore';
import useSocket from '../hooks/useSocket';
import { messagesAPI, patientsAPI, scansAPI, reportsAPI } from '../api/client';
import { getImageUrl } from '../api/imageUrl';
import {
  Send, User, MessageSquare, ShieldAlert, Award, Loader2,
  Paperclip, Trash2, Edit2, X, Image as ImageIcon, Eye
} from 'lucide-react';

export default function Messages() {
  const { user, fetchMe } = useAuthStore();
  const [patients, setPatients] = useState([]);
  const [activePatient, setActivePatient] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newText, setNewText] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  // Attachment states
  const [selectedImage, setSelectedImage] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef(null);

  // Edit states
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  // Connection UI states for patient
  const [doctors, setDoctors] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [connectingId, setConnectingId] = useState(null);
  const [connectedDoctor, setConnectedDoctor] = useState(null);
  const [requestStatus, setRequestStatus] = useState({}); // doctorId -> 'sent'

  const isDoc = user?.role === 'doctor';
  const patientId = user?.patient_id;
  const doctorId = user?.doctor_id;

  // Case files / reports drawer states
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerReports, setDrawerReports] = useState([]);
  const [drawerScans, setDrawerScans] = useState([]);
  const [drawerLoading, setDrawerLoading] = useState(false);


  // Real-time socket integration
  useSocket({
    new_message: (msg) => {
      if (
        (isDoc && activePatient?.id === msg.patient_id) ||
        (!isDoc && (user?.id === msg.receiver_id || user?.id === msg.sender_id))
      ) {
        setMessages((prev) => {
          if (prev.some((m) => m.message_id === msg.message_id)) return prev;
          return [...prev, msg];
        });
      }
    },
    edit_message: (payload) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.message_id === payload.message_id ? { ...m, content: payload.content } : m
        )
      );
    },
    delete_message: (payload) => {
      setMessages((prev) => prev.filter((m) => m.message_id !== payload.message_id));
    },
  });

  // Refresh user profile on mount to get the latest doctor connection state
  useEffect(() => {
    fetchMe();
  }, []);

  // Load patient/doctor data
  useEffect(() => {
    if (isDoc) {
      patientsAPI.list()
        .then((res) => {
          setPatients(res.data);
          if (res.data.length > 0) {
            setActivePatient(res.data[0]);
          }
        })
        .catch(() => { })
        .finally(() => setLoading(false));
    } else {
      setLoading(true);
      // Fetch connection status info
      Promise.all([
        patientsAPI.listDoctors(),
        patientsAPI.getPendingInvitations(),
      ])
        .then(([docsRes, invitesRes]) => {
          setDoctors(docsRes.data);
          setPendingInvites(invitesRes.data);

          // Check if patient is already connected
          if (doctorId) {
            const doc = docsRes.data.find(d => d.id === doctorId);
            if (doc) setConnectedDoctor(doc);
          }
        })
        .catch(() => { })
        .finally(() => setLoading(false));
    }
  }, [isDoc, doctorId]);

  // Load message thread
  useEffect(() => {
    const activeId = isDoc ? activePatient?.id : patientId;
    if (!activeId) return;

    messagesAPI.getThread(activeId)
      .then((res) => {
        setMessages(res.data);
        scrollToBottom();
      })
      .catch(() => { });
  }, [activePatient, patientId, isDoc]);

  // Load patient case files when drawer is opened
  useEffect(() => {
    const activeId = isDoc ? activePatient?.id : patientId;
    if (!activeId || !drawerOpen) return;

    setDrawerLoading(true);
    Promise.all([
      scansAPI.getPatientScans(activeId).catch(() => ({ data: [] })),
      reportsAPI.getPatientReports(activeId).catch(() => ({ data: [] }))
    ])
      .then(([scansRes, reportsRes]) => {
        setDrawerScans(scansRes.data);
        setDrawerReports(reportsRes.data);
      })
      .catch(() => { })
      .finally(() => setDrawerLoading(false));
  }, [activePatient, patientId, isDoc, drawerOpen]);

  // Scroll messages
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const res = await messagesAPI.uploadImage(file);
      setSelectedImage(res.data.image_url);
    } catch (err) {
      alert('Failed to upload image. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newText.trim() && !selectedImage) return;

    const activeId = isDoc ? activePatient?.id : patientId;
    const receiverId = isDoc ? activePatient?.user_id : doctorId;

    if (!activeId || !receiverId) return;

    try {
      const res = await messagesAPI.send({
        receiver_id: receiverId,
        patient_id: activeId,
        content: newText.trim() || null,
        image_url: selectedImage || null,
      });

      const tempMsg = {
        message_id: res.data.message_id,
        sender_id: user.id,
        receiver_id: receiverId,
        content: newText.trim() || null,
        image_url: selectedImage || null,
        sent_at: res.data.sent_at,
        is_read: false,
      };
      setMessages((prev) => [...prev, tempMsg]);
      setNewText('');
      setSelectedImage(null);
    } catch { }
  };

  const startEdit = (msg) => {
    setEditingId(msg.message_id);
    setEditText(msg.content || '');
  };

  const saveEdit = async (msgId) => {
    if (!editText.trim()) return;
    try {
      await messagesAPI.edit(msgId, editText.trim());
      setMessages((prev) =>
        prev.map((m) =>
          m.message_id === msgId ? { ...m, content: editText.trim() } : m
        )
      );
      setEditingId(null);
    } catch (err) {
      alert('Failed to edit message.');
    }
  };

  const handleDelete = async (msgId) => {
    if (!window.confirm('Are you sure you want to delete this message?')) return;
    try {
      await messagesAPI.delete(msgId);
      setMessages((prev) => prev.filter((m) => m.message_id !== msgId));
    } catch (err) {
      alert('Failed to delete message.');
    }
  };

  // Connection request handlers
  const handleConnect = async (docId) => {
    setConnectingId(docId);
    try {
      await patientsAPI.sendRequest(docId);
      setRequestStatus((prev) => ({ ...prev, [docId]: 'sent' }));
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to send connection request.");
    } finally {
      setConnectingId(null);
    }
  };

  const handleInviteAction = async (inviteId, status) => {
    setLoading(true);
    try {
      await patientsAPI.respondToInvitation(inviteId, status);
      await fetchMe();
    } catch (err) {
      alert(err.response?.data?.detail || "Action failed.");
    } finally {
      setLoading(false);
    }
  };

  // ── Render Connection Interface for Unconnected Patients ──────────────────────
  if (!isDoc && !doctorId) {
    return (
      <div className="animate-fade-in" style={{ maxWidth: 800, margin: '0 auto' }}>
        <div className="page-header">
          <h1 className="page-title">💬 Clinical Consultations</h1>
          <p className="page-subtitle">Connect with a certified neurological specialist to discuss your MRI scans</p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <Loader2 className="animate-spin" size={24} style={{ margin: '0 auto', color: 'var(--accent-cyan)' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Pending Invitations from Doctors */}
            {pendingInvites.length > 0 && (
              <div className="glass-card" style={{ borderLeft: '4px solid var(--accent-cyan)' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem', fontSize: '1.1rem' }}>
                  <Award size={18} style={{ color: 'var(--accent-cyan)' }} />
                  Specialist Connection Invitations
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {pendingInvites.map(invite => (
                    <div key={invite.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.75rem 1rem', borderRadius: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Dr. {invite.doctor_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Specialist Invitation</div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-primary" onClick={() => handleInviteAction(invite.id, 'accepted')} style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}>Accept</button>
                        <button className="btn btn-outline" onClick={() => handleInviteAction(invite.id, 'declined')} style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}>Decline</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Doctors Directory */}
            <div className="glass-card">
              <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Available Specialists</h2>
              {doctors.length === 0 ? (
                <p className="text-secondary text-sm">No registered specialist doctors found.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                  {doctors.map(doc => (
                    <div key={doc.id} className="glass-card" style={{ padding: '1rem', border: '1px solid var(--border-subtle)', background: 'var(--bg-body)' }}>
                      <h4 style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>Dr. {doc.full_name}</h4>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0 12px 0' }}>{doc.email}</p>
                      {requestStatus[doc.id] === 'sent' ? (
                        <button className="btn btn-outline" style={{ width: '100%', pointerEvents: 'none', opacity: 0.6 }} disabled>Request Sent</button>
                      ) : (
                        <button
                          className="btn btn-primary"
                          onClick={() => handleConnect(doc.id)}
                          disabled={connectingId !== null}
                          style={{ width: '100%' }}
                        >
                          {connectingId === doc.id ? <Loader2 className="animate-spin" size={14} /> : 'Connect Specialist'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="alert-banner medium">
              <ShieldAlert size={18} />
              <div>
                <strong>Why connect?</strong>
                <p style={{ fontSize: '0.8rem', marginTop: 2, color: 'var(--text-secondary)' }}>
                  Connecting with a specialist registers you as their active patient, sharing your diagnostic reports, visual brain segmentations, and daily symptom logs directly with their dashboard.
                </p>
              </div>
            </div>

          </div>
        )}
      </div>
    );
  }

  // ── Render Normal Chat Interface ───────────────────────────────────────────────
  return (
    <div className="animate-fade-in" style={{ height: 'calc(100vh - 4rem)', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <h1 className="page-title">💬 Clinical Messaging</h1>
        <p className="page-subtitle">Real-time end-to-end encrypted consultations</p>
      </div>

      <div className="glass-card" style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: isDoc ? '250px 1fr' : '1fr', padding: 0, overflow: 'hidden' }}>
        {/* Doctor's Patient Sidebar */}
        {isDoc && (
          <div style={{ borderRight: '1px solid var(--border-subtle)', overflowY: 'auto', background: 'var(--overlay-faint)' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-subtle)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Active Cases
            </div>
            {patients.map((p) => (
              <div
                key={p.id}
                onClick={() => setActivePatient(p)}
                style={{
                  padding: '1rem',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: activePatient?.id === p.id ? 'var(--accent-cyan-dim)' : 'transparent',
                  color: activePatient?.id === p.id ? 'var(--accent-cyan)' : 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  transition: 'all 0.2s',
                }}
              >
                <User size={16} />
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.9rem', fontWeight: 500 }}>
                  {p.full_name}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Chat Window */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
          {/* Header */}
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-green)' }} />
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                {isDoc ? `Case chat: ${activePatient?.full_name || 'Loading...'}` : `Consultation: Dr. ${connectedDoctor?.full_name || 'Assigned Specialist'}`}
              </div>
            </div>

            {/* View Reports & Scans drawer button */}
            <button
              onClick={() => setDrawerOpen(true)}
              className="btn btn-outline btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', padding: '4px 12px' }}
            >
              📋 Case Files & Reports
            </button>
          </div>

          {/* Messages list */}
          <div style={{ flex: 1, minHeight: 0, padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {messages.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                <MessageSquare size={36} style={{ marginBottom: 8, opacity: 0.5 }} />
                <p style={{ fontSize: '0.85rem' }}>No messages in this thread yet. Send a query below.</p>
              </div>
            ) : (
              messages.map((m) => {
                const self = m.sender_id === user?.id;
                const isEditing = editingId === m.message_id;

                return (
                  <div
                    key={m.message_id}
                    className="chat-message-container"
                    style={{
                      alignSelf: self ? 'flex-end' : 'flex-start',
                      maxWidth: '70%',
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative'
                    }}
                  >
                    <div
                      style={{
                        padding: '0.75rem 1rem',
                        borderRadius: 'var(--radius-md)',
                        background: self ? 'var(--gradient-cyan)' : 'var(--bg-secondary)',
                        color: self ? '#050b18' : 'var(--text-primary)',
                        fontWeight: self ? 600 : 400,
                        fontSize: '0.88rem',
                        lineHeight: 1.5,
                        boxShadow: self ? 'var(--shadow-cyan)' : 'none',
                        border: self ? 'none' : '1px solid var(--border-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6
                      }}
                    >
                      {/* Image attachment */}
                      {m.image_url && (
                        <a href={m.image_url} target="_blank" rel="noreferrer" style={{ display: 'block', marginBottom: 4 }}>
                          <img
                            src={m.image_url}
                            alt="Attachment"
                            style={{
                              maxWidth: '100%',
                              maxHeight: 250,
                              borderRadius: 8,
                              border: '1px solid rgba(255,255,255,0.1)',
                              cursor: 'zoom-in'
                            }}
                          />
                        </a>
                      )}

                      {/* Text content or edit input */}
                      {isEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <input
                            type="text"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit(m.message_id);
                              else if (e.key === 'Escape') setEditingId(null);
                            }}
                            style={{
                              background: 'var(--overlay-soft)',
                              border: '1px solid rgba(255,255,255,0.2)',
                              color: 'inherit',
                              padding: '4px 8px',
                              borderRadius: 4,
                              fontSize: '0.88rem',
                              width: '100%',
                              outline: 'none'
                            }}
                            autoFocus
                          />
                          <div style={{ display: 'flex', gap: 10, fontSize: '0.75rem', justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => saveEdit(m.message_id)} style={{ color: 'var(--accent-green)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Save</button>
                            <button type="button" onClick={() => setEditingId(null)} style={{ color: 'var(--accent-red)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div>{m.content}</div>
                      )}

                      {/* Edit/Delete controls (sender only) */}
                      {self && !isEditing && (
                        <div className="message-controls" style={{
                          display: 'flex',
                          gap: 12,
                          marginTop: 4,
                          borderTop: m.content ? '1px solid rgba(255,255,255,0.1)' : 'none',
                          paddingTop: m.content ? 4 : 0,
                          justifyContent: 'flex-end',
                          opacity: 0.8
                        }}>
                          {m.content && (
                            <button
                              type="button"
                              onClick={() => startEdit(m)}
                              style={{ color: 'inherit', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}
                              title="Edit message"
                            >
                              <Edit2 size={12} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDelete(m.message_id)}
                            style={{ color: self ? '#991b1b' : 'var(--accent-red)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}
                            title="Delete message"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--text-muted)',
                        marginTop: 4,
                        marginBottom: 4,
                        alignSelf: self ? 'flex-end' : 'flex-start',
                      }}
                    >
                      {new Date(m.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Attachment preview bar */}
          {selectedImage && (
            <div style={{
              padding: '0.5rem 1rem',
              borderTop: '1px solid var(--border-subtle)',
              background: 'var(--overlay-soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ImageIcon size={16} className="text-cyan" />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Image ready to send...</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedImage(null)}
                style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Input form */}
          <form onSubmit={handleSend} style={{ padding: '1rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageSelect}
              style={{ display: 'none' }}
              accept="image/*"
            />
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
              style={{ padding: '0 0.75rem', height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {uploadingImage ? <Loader2 className="animate-spin" size={16} /> : <Paperclip size={16} />}
            </button>
            <input
              className="form-input"
              style={{ flex: 1 }}
              placeholder={uploadingImage ? "Uploading attachment..." : "Type your message here..."}
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              disabled={uploadingImage}
            />
            <button type="submit" className="btn btn-primary" style={{ padding: '0 1.25rem', height: 42 }} disabled={uploadingImage}>
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>

      {/* Case Details / Scan Reports Drawer */}
      {drawerOpen && (
        <>
          <div className="details-drawer-overlay" onClick={() => setDrawerOpen(false)} />
          <div className="details-drawer">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.2rem' }}>
                  📋 Case Records & Scans
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  MRI Scans & AI Reports
                </span>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setDrawerOpen(false)} style={{ padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            {drawerLoading ? (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <Loader2 className="animate-spin" size={32} style={{ margin: '0 auto', color: 'var(--accent-cyan)' }} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Reports Section */}
                <div>
                  <h4 style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Diagnostic Reports ({drawerReports.length})</h4>
                  {drawerReports.length === 0 ? (
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No reports generated yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {drawerReports.map((r) => (
                        <div key={r.report_id} className="glass-card" style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', fontSize: '0.82rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                            <span>Report #{r.report_id}</span>
                            <span style={{ color: 'var(--accent-cyan)' }}>{r.tumor_type === 'notumor' ? 'No Tumor' : r.tumor_type}</span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                            Date: {new Date(r.created_at).toLocaleDateString()}
                          </div>
                          {r.tumor_stage && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--accent-purple)', marginTop: 2 }}>
                              Stage: {r.tumor_stage}
                            </div>
                          )}
                          <div style={{
                            background: 'var(--overlay-soft)',
                            padding: '6px',
                            borderRadius: 4,
                            marginTop: 8,
                            fontSize: '0.78rem',
                            whiteSpace: 'pre-wrap',
                            maxHeight: 120,
                            overflowY: 'auto',
                            fontFamily: 'monospace'
                          }}>
                            {r.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Scans Section */}
                <div>
                  <h4 style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>MRI Scans & Analysis ({drawerScans.length})</h4>
                  {drawerScans.length === 0 ? (
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No scans uploaded yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {drawerScans.map((s) => (
                        <div key={s.scan_id} className="glass-card" style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', fontSize: '0.82rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, marginBottom: 8 }}>
                            <span>Scan #{s.scan_id}</span>
                            <span className="badge badge-medium" style={{ textTransform: 'capitalize' }}>
                              {s.final_classification === 'notumor' ? 'No Tumor' : s.final_classification}
                            </span>
                          </div>

                          {/* Image Thumbnails */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '0.5rem' }}>
                            {s.original_image_url && (
                              <div style={{ textAlign: 'center' }}>
                                <a href={getImageUrl(s.original_image_url)} target="_blank" rel="noreferrer">
                                  <img src={getImageUrl(s.original_image_url)} alt="Original" style={{ width: '100%', height: 60, objectFit: 'contain', borderRadius: 4, background: '#000', border: '1px solid var(--border-subtle)' }} />
                                </a>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Original</span>
                              </div>
                            )}
                            {s.segmentation_image_url && (
                              <div style={{ textAlign: 'center' }}>
                                <a href={getImageUrl(s.segmentation_image_url)} target="_blank" rel="noreferrer">
                                  <img src={getImageUrl(s.segmentation_image_url)} alt="Segmentation" style={{ width: '100%', height: 60, objectFit: 'contain', borderRadius: 4, background: '#000', border: '1px solid var(--border-subtle)' }} />
                                </a>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>K-Means</span>
                              </div>
                            )}
                            {s.gradcam_image_url && (
                              <div style={{ textAlign: 'center' }}>
                                <a href={getImageUrl(s.gradcam_image_url)} target="_blank" rel="noreferrer">
                                  <img src={getImageUrl(s.gradcam_image_url)} alt="Grad-CAM" style={{ width: '100%', height: 60, objectFit: 'contain', borderRadius: 4, background: '#000', border: '1px solid var(--border-subtle)' }} />
                                </a>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Grad-CAM</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
