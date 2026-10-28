import React, { useEffect, useState } from 'react';
import {
  Calendar, Clock, User, CheckCircle2, XCircle,
  AlertTriangle, Plus, ChevronRight, FileText, Check, X
} from 'lucide-react';
import { appointmentsAPI, patientsAPI } from '../api/client';
import useAuthStore from '../store/authStore';

export default function AppointmentsList({ previewOnly = false }) {
  const { user } = useAuthStore();
  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showBookModal, setShowBookModal] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  // Form state
  const [doctorId, setDoctorId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [appointmentType, setAppointmentType] = useState('consultation');
  const [reason, setReason] = useState('');

  const loadAppointments = async () => {
    setLoading(true);
    try {
      const res = await appointmentsAPI.list(statusFilter || undefined);
      setAppointments(res.data);
    } catch (err) {
      setNotification({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to load appointments.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAppointments();
    if (user?.role === 'patient') {
      patientsAPI.listDoctors?.()
        ?.then(res => setDoctors(res.data || []))
        ?.catch(() => {});
    }
  }, [statusFilter, user]);

  const handleBookSubmit = async (e) => {
    e.preventDefault();
    setBookingLoading(true);
    setNotification(null);
    try {
      await appointmentsAPI.create({
        doctor_id: parseInt(doctorId, 10),
        scheduled_at: new Date(scheduledAt).toISOString(),
        duration_minutes: 30,
        appointment_type: appointmentType,
        reason: reason || undefined,
      });
      setShowBookModal(false);
      setDoctorId('');
      setScheduledAt('');
      setReason('');
      setNotification({
        type: 'success',
        message: 'Appointment requested successfully. Awaiting specialist confirmation.',
      });
      await loadAppointments();
    } catch (err) {
      setNotification({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to request appointment.',
      });
    } finally {
      setBookingLoading(false);
    }
  };

  const handleStatusChange = async (appointmentId, newStatus, extraData = {}) => {
    try {
      await appointmentsAPI.updateStatus(appointmentId, {
        status: newStatus,
        ...extraData,
      });
      setNotification({
        type: 'success',
        message: `Appointment ${newStatus}.`,
      });
      await loadAppointments();
    } catch (err) {
      setNotification({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to update appointment.',
      });
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'scheduled':
        return { label: 'Confirmed', bg: 'rgba(13, 148, 136, 0.2)', color: '#2dd4bf', icon: <CheckCircle2 size={13} /> };
      case 'requested':
        return { label: 'Pending Review', bg: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', icon: <Clock size={13} /> };
      case 'completed':
        return { label: 'Completed', bg: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', icon: <Check size={13} /> };
      case 'cancelled':
        return { label: 'Cancelled', bg: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', icon: <XCircle size={13} /> };
      default:
        return { label: status, bg: 'rgba(148, 163, 184, 0.2)', color: '#cbd5e1', icon: null };
    }
  };

  return (
    <div style={{ background: 'rgba(15, 23, 42, 0.75)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '1.5rem' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={18} color="#0d9488" />
            Clinical Consultations
          </h2>
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
            Direct scheduling with board-certified neurological specialists
          </p>
        </div>

        {user?.role === 'patient' && !previewOnly && (
          <button
            onClick={() => setShowBookModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.45rem 0.9rem',
              background: '#0d9488',
              border: 'none',
              borderRadius: '6px',
              color: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Plus size={15} /> Book Appointment
          </button>
        )}
      </div>

      {notification && (
        <div style={{
          padding: '0.65rem 1rem',
          borderRadius: '6px',
          fontSize: '0.82rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: notification.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(13, 148, 136, 0.2)',
          border: `1px solid ${notification.type === 'error' ? 'rgba(239, 68, 68, 0.35)' : 'rgba(13, 148, 136, 0.4)'}`,
          color: notification.type === 'error' ? '#fca5a5' : '#5eead4',
        }}>
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Filter tabs */}
      {!previewOnly && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '0.5rem' }}>
          {['', 'requested', 'scheduled', 'completed', 'cancelled'].map((st) => (
            <button
              key={st || 'all'}
              onClick={() => setStatusFilter(st)}
              style={{
                background: statusFilter === st ? 'rgba(13, 148, 136, 0.2)' : 'none',
                border: 'none',
                borderRadius: '4px',
                padding: '0.3rem 0.65rem',
                color: statusFilter === st ? '#2dd4bf' : '#94a3b8',
                fontSize: '0.78rem',
                fontWeight: 600,
                textTransform: 'capitalize',
                cursor: 'pointer',
              }}
            >
              {st || 'All Slots'}
            </button>
          ))}
        </div>
      )}

      {/* Appointment Cards */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.85rem' }}>
          Loading consultations...
        </div>
      ) : appointments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b', fontSize: '0.85rem' }}>
          No consultations found.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {appointments.slice(0, previewOnly ? 3 : 50).map((appt) => {
            const badge = getStatusBadge(appt.status);
            const dateStr = new Date(appt.scheduled_at).toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            });
            const timeStr = new Date(appt.scheduled_at).toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={appt.id}
                style={{
                  background: 'rgba(2, 6, 23, 0.45)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '8px',
                  padding: '0.9rem 1.1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: '8px',
                    background: 'rgba(13, 148, 136, 0.15)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#2dd4bf',
                    flexShrink: 0,
                  }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
                      {new Date(appt.scheduled_at).toLocaleString('en-US', { month: 'short' })}
                    </span>
                    <span style={{ fontSize: '1rem', fontWeight: 800, lineHeight: 1 }}>
                      {new Date(appt.scheduled_at).getDate()}
                    </span>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                      <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.9rem' }}>
                        {user?.role === 'doctor' ? `Patient: ${appt.patient_name || 'Patient'}` : `Dr. ${appt.doctor_name || 'Specialist'}`}
                      </span>
                      <span style={{
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        background: badge.bg,
                        color: badge.color,
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}>
                        {badge.icon} {badge.label}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                      <span>{dateStr} at {timeStr} ({appt.duration_minutes} min)</span>
                      <span>•</span>
                      <span style={{ textTransform: 'capitalize' }}>{appt.appointment_type.replace('_', ' ')}</span>
                    </div>

                    {appt.reason && (
                      <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.3rem', fontStyle: 'italic' }}>
                        "{appt.reason}"
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                  {user?.role === 'doctor' && appt.status === 'requested' && (
                    <button
                      onClick={() => handleStatusChange(appt.id, 'scheduled')}
                      style={{
                        padding: '0.35rem 0.7rem',
                        background: '#0d9488',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Confirm
                    </button>
                  )}

                  {user?.role === 'doctor' && appt.status === 'scheduled' && (
                    <button
                      onClick={() => handleStatusChange(appt.id, 'completed')}
                      style={{
                        padding: '0.35rem 0.7rem',
                        background: '#0284c7',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Complete
                    </button>
                  )}

                  {(appt.status === 'requested' || appt.status === 'scheduled') && (
                    <button
                      onClick={() => handleStatusChange(appt.id, 'cancelled', { cancellation_reason: 'Cancelled by user' })}
                      style={{
                        padding: '0.35rem 0.65rem',
                        background: 'none',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        color: '#fca5a5',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Booking Modal */}
      {showBookModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 110,
          padding: '1rem',
        }}>
          <div style={{
            width: '100%',
            maxWidth: '440px',
            background: '#0b1329',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '12px',
            padding: '1.75rem',
            position: 'relative',
          }}>
            <button
              onClick={() => setShowBookModal(false)}
              style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>

            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.35rem 0', color: '#f8fafc' }}>
              Request Specialist Consultation
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 1.25rem 0' }}>
              Select a neurologist or neuro-oncologist for synchronous clinical review.
            </p>

            <form onSubmit={handleBookSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Attending Specialist ID / Doctor
                </label>
                <input
                  type="number"
                  required
                  placeholder="Doctor user ID (e.g. 1)"
                  value={doctorId}
                  onChange={(e) => setDoctorId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    background: 'rgba(2, 6, 23, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Proposed Date & Time
                </label>
                <input
                  type="datetime-local"
                  required
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    background: 'rgba(2, 6, 23, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Consultation Purpose
                </label>
                <select
                  value={appointmentType}
                  onChange={(e) => setAppointmentType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    background: '#0f172a',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="consultation">Initial Consultation</option>
                  <option value="scan_review">MRI Scan Review</option>
                  <option value="follow_up">Follow-Up Review</option>
                  <option value="urgent">Urgent Escalation</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Clinical Symptoms / Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe your current symptoms or specific scan to review..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    background: 'rgba(2, 6, 23, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowBookModal(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'none',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bookingLoading}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#0d9488',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: bookingLoading ? 'not-allowed' : 'pointer',
                    fontSize: '0.82rem',
                  }}
                >
                  {bookingLoading ? 'Requesting...' : 'Request Slot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
