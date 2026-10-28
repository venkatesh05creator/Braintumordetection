import React, { useEffect, useState } from 'react';
import {
  Calendar, Clock, User, CheckCircle2, XCircle,
  AlertTriangle, Plus, ChevronRight, FileText, Check, X,
  Stethoscope, Filter
} from 'lucide-react';
import { appointmentsAPI, patientsAPI } from '../api/client';
import useAuthStore from '../store/authStore';

export default function AppointmentsList({ previewOnly = false }) {
  const { user } = useAuthStore();
  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showBookModal, setShowBookModal] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  // Form state
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [appointmentType, setAppointmentType] = useState('consultation');
  const [reason, setReason] = useState('');

  const loadAppointments = async () => {
    setLoading(true);
    try {
      const res = await appointmentsAPI.list(statusFilter || undefined);
      setAppointments(res.data || []);
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
        ?.then(res => {
          const docs = res.data || [];
          setDoctors(docs);
          const assigned = docs.find(d => d.is_assigned);
          if (assigned) {
            setSelectedDoctorId(String(assigned.id));
          } else if (docs.length > 0) {
            setSelectedDoctorId(String(docs[0].id));
          } else {
            setSelectedDoctorId('');
          }
        })
        ?.catch(() => {});
    } else if (user?.role === 'doctor') {
      patientsAPI.list?.()
        ?.then(async (res) => {
          let pts = res.data || [];
          if (pts.length === 0 && patientsAPI.listDirectory) {
            try {
              const dirRes = await patientsAPI.listDirectory();
              pts = dirRes.data || [];
            } catch (err) {}
          }
          setPatients(pts);
          if (pts.length > 0) setSelectedPatientId(String(pts[0].id));
        })
        ?.catch(() => {});
    }
  }, [statusFilter, user]);

  const handleBookSubmit = async (e) => {
    e.preventDefault();
    setBookingLoading(true);
    setNotification(null);

    try {
      const payload = {
        scheduled_at: new Date(scheduledAt).toISOString(),
        duration_minutes: parseInt(durationMinutes, 10),
        appointment_type: appointmentType,
        reason: reason.trim() || undefined,
      };

      if (user?.role === 'doctor') {
        const ptId = selectedPatientId || (patients[0]?.id ? String(patients[0].id) : null);
        if (!ptId) {
          setNotification({ type: 'error', message: 'Please select a patient or invite a patient first.' });
          setBookingLoading(false);
          return;
        }
        payload.patient_id = parseInt(ptId, 10);
      } else {
        // Patient booking: if selected, attach doctor_id; if empty/auto, backend auto-assigns primary on-call doctor
        if (selectedDoctorId && selectedDoctorId !== 'auto') {
          payload.doctor_id = parseInt(selectedDoctorId, 10);
        }
      }

      await appointmentsAPI.create(payload);
      setShowBookModal(false);
      setReason('');
      setScheduledAt('');
      setNotification({
        type: 'success',
        message: user?.role === 'doctor'
          ? 'Appointment scheduled and confirmed.'
          : 'Appointment requested successfully. Awaiting specialist confirmation.',
      });
      await loadAppointments();
    } catch (err) {
      setNotification({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to schedule appointment.',
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
        message: `Appointment marked as ${newStatus}.`,
      });
      await loadAppointments();
    } catch (err) {
      setNotification({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to update appointment status.',
      });
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'scheduled':
        return { bg: 'rgba(13, 148, 136, 0.15)', color: '#2dd4bf', label: 'Scheduled', icon: <Check size={12} /> };
      case 'requested':
        return { bg: 'rgba(234, 179, 8, 0.15)', color: '#facc15', label: 'Requested', icon: <Clock size={12} /> };
      case 'completed':
        return { bg: 'rgba(2, 132, 199, 0.15)', color: '#38bdf8', label: 'Completed', icon: <CheckCircle2 size={12} /> };
      case 'cancelled':
        return { bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171', label: 'Cancelled', icon: <XCircle size={12} /> };
      default:
        return { bg: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', label: status, icon: null };
    }
  };

  return (
    <div style={{ width: '100%' }}>
      {/* Top Banner & Action */}
      {!previewOnly && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.35rem 0', color: '#f8fafc' }}>
              Clinical Consultations &amp; Appointments
            </h2>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.85rem' }}>
              {user?.role === 'doctor'
                ? 'Manage synchronous patient consultations, MRI reviews, and follow-ups.'
                : 'Request and track specialist neurological reviews and consultations.'}
            </p>
          </div>

          <button
            onClick={() => setShowBookModal(true)}
            style={{
              padding: '0.65rem 1.25rem',
              borderRadius: '6px',
              border: 'none',
              background: '#0d9488',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Plus size={16} />
            {user?.role === 'doctor' ? 'Schedule Patient Appointment' : 'Request Appointment'}
          </button>
        </div>
      )}

      {/* Notification Toast */}
      {notification && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: '6px',
          fontSize: '0.85rem',
          marginBottom: '1.25rem',
          background: notification.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(13, 148, 136, 0.15)',
          border: `1px solid ${notification.type === 'error' ? 'rgba(239, 68, 68, 0.35)' : 'rgba(13, 148, 136, 0.35)'}`,
          color: notification.type === 'error' ? '#fca5a5' : '#5eead4',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      {!previewOnly && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {[
            { id: '', label: 'All Consultations' },
            { id: 'scheduled', label: 'Scheduled' },
            { id: 'requested', label: 'Pending Requests' },
            { id: 'completed', label: 'Completed' },
            { id: 'cancelled', label: 'Cancelled' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              style={{
                padding: '0.45rem 0.9rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: '1px solid',
                borderColor: statusFilter === tab.id ? '#0d9488' : 'rgba(255, 255, 255, 0.08)',
                background: statusFilter === tab.id ? 'rgba(13, 148, 136, 0.15)' : 'rgba(2, 6, 23, 0.4)',
                color: statusFilter === tab.id ? '#2dd4bf' : '#94a3b8',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Appointments List Card */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8', fontSize: '0.85rem' }}>
          <div className="spinner" style={{ width: 24, height: 24, margin: '0 auto 0.75rem', borderWidth: 2 }} />
          Loading appointments...
        </div>
      ) : appointments.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <Calendar size={36} color="#64748b" style={{ margin: '0 auto 0.75rem' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#f8fafc', margin: '0 0 0.35rem 0' }}>
            No appointments found
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '0 0 1rem 0' }}>
            {statusFilter
              ? `There are no consultations currently with status "${statusFilter}".`
              : 'You have no scheduled clinical appointments yet.'}
          </p>
          <button
            onClick={() => setShowBookModal(true)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: 'none',
              background: '#0d9488',
              color: '#ffffff',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {user?.role === 'doctor' ? 'Schedule with a Patient' : 'Book First Appointment'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {appointments.slice(0, previewOnly ? 3 : 50).map((appt) => {
            const badge = getStatusBadge(appt.status);
            const apptDate = new Date(appt.scheduled_at);
            const dateStr = apptDate.toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
            const timeStr = apptDate.toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={appt.id}
                className="glass-panel"
                style={{
                  padding: '1.1rem 1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1.25rem',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem', minWidth: '240px' }}>
                  <div style={{
                    width: 52,
                    height: 52,
                    borderRadius: '8px',
                    background: 'rgba(13, 148, 136, 0.15)',
                    border: '1px solid rgba(13, 148, 136, 0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#2dd4bf',
                    flexShrink: 0,
                  }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
                      {apptDate.toLocaleString('en-US', { month: 'short' })}
                    </span>
                    <span style={{ fontSize: '1.15rem', fontWeight: 800, lineHeight: 1 }}>
                      {apptDate.getDate()}
                    </span>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.95rem' }}>
                        {user?.role === 'doctor'
                          ? `Patient: ${appt.patient_name || 'Assigned Patient'}`
                          : `Dr. ${appt.doctor_name || 'Attending Specialist'}`}
                      </span>
                      <span style={{
                        padding: '0.2rem 0.55rem',
                        borderRadius: '9999px',
                        background: badge.bg,
                        color: badge.color,
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                      }}>
                        {badge.icon} {badge.label}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', fontSize: '0.78rem', color: '#94a3b8' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={13} /> {dateStr} at {timeStr} ({appt.duration_minutes} min)
                      </span>
                      <span>•</span>
                      <span style={{ textTransform: 'capitalize' }}>
                        {appt.appointment_type.replace('_', ' ')}
                      </span>
                    </div>

                    {appt.reason && (
                      <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: '0.35rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Clinical Note:</span> "{appt.reason}"
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                  {user?.role === 'doctor' && appt.status === 'requested' && (
                    <button
                      onClick={() => handleStatusChange(appt.id, 'scheduled')}
                      style={{
                        padding: '0.45rem 0.85rem',
                        background: '#0d9488',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
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
                        padding: '0.45rem 0.85rem',
                        background: '#0284c7',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Mark Completed
                    </button>
                  )}

                  {(appt.status === 'requested' || appt.status === 'scheduled') && (
                    <button
                      onClick={() => handleStatusChange(appt.id, 'cancelled', { cancellation_reason: 'Cancelled by clinician/patient' })}
                      style={{
                        padding: '0.45rem 0.85rem',
                        background: 'none',
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                        color: '#fca5a5',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
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

      {/* Booking / Scheduling Modal */}
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
            maxWidth: '480px',
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

            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.35rem 0', color: '#f8fafc' }}>
              {user?.role === 'doctor' ? 'Schedule Patient Appointment' : 'Request Specialist Consultation'}
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0 0 1.25rem 0' }}>
              {user?.role === 'doctor'
                ? 'Create a scheduled clinical appointment with one of your connected patients.'
                : 'Select an attending specialist for synchronous neurological consultation.'}
            </p>

            <form onSubmit={handleBookSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Doctor selects patient, patient selects doctor */}
              {user?.role === 'doctor' ? (
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.35rem' }}>
                    Select Patient
                  </label>
                  {patients.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: '#f87171', padding: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px' }}>
                      No patients connected yet. You can invite patients from the Patients tab.
                    </div>
                  ) : (
                    <select
                      value={selectedPatientId}
                      onChange={(e) => setSelectedPatientId(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '0.65rem 0.85rem',
                        background: 'rgba(2, 6, 23, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '6px',
                        color: '#f8fafc',
                        fontSize: '0.85rem',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    >
                      {patients.map((p) => (
                        <option key={p.id} value={p.id} style={{ background: '#0b1329' }}>
                          {p.full_name || `Patient #${p.id}`} {p.email ? `(${p.email})` : ''} - {p.risk_level || 'Standard'}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1' }}>
                      Attending Neurologist / Specialist
                    </label>
                    <span style={{ fontSize: '0.72rem', color: '#0d9488', fontWeight: 500 }}>
                      No doctor ID needed
                    </span>
                  </div>

                  <select
                    value={selectedDoctorId}
                    onChange={(e) => setSelectedDoctorId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      background: 'rgba(2, 6, 23, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '0.85rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="" style={{ background: '#0b1329' }}>
                      First Available Specialist (Auto-Assign)
                    </option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id} style={{ background: '#0b1329' }}>
                        Dr. {d.full_name} {d.is_assigned ? '★ (Your Primary Doctor)' : ''} - {d.specialty || 'Neuro-Oncology'}
                      </option>
                    ))}
                  </select>
                  <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '0.35rem', lineHeight: '1.3' }}>
                    Select a specialist from the list, or keep Auto-Assign to have our clinical system pair you with an available neuro-oncologist.
                  </div>
                </div>
              )}

              {/* Date and Time */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.35rem' }}>
                    Date &amp; Time
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.75rem',
                      background: 'rgba(2, 6, 23, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '0.85rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.35rem' }}>
                    Duration
                  </label>
                  <select
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.75rem',
                      background: 'rgba(2, 6, 23, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '0.85rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value={15} style={{ background: '#0b1329' }}>15 minutes</option>
                    <option value={30} style={{ background: '#0b1329' }}>30 minutes</option>
                    <option value={45} style={{ background: '#0b1329' }}>45 minutes</option>
                    <option value={60} style={{ background: '#0b1329' }}>60 minutes</option>
                  </select>
                </div>
              </div>

              {/* Consultation Type */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.35rem' }}>
                  Consultation Type
                </label>
                <select
                  value={appointmentType}
                  onChange={(e) => setAppointmentType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.75rem',
                    background: 'rgba(2, 6, 23, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="consultation" style={{ background: '#0b1329' }}>Standard Clinical Consultation</option>
                  <option value="scan_review" style={{ background: '#0b1329' }}>MRI Scan &amp; Volumetry Review</option>
                  <option value="follow_up" style={{ background: '#0b1329' }}>Post-Therapy Follow-Up</option>
                  <option value="urgent" style={{ background: '#0b1329' }}>Urgent Symptom Escalation</option>
                </select>
              </div>

              {/* Reason / Notes */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.35rem' }}>
                  Clinical Note / Reason
                </label>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Review latest axial T1 MRI and discuss headache frequency"
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.75rem',
                    background: 'rgba(2, 6, 23, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                    outline: 'none',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowBookModal(false)}
                  style={{
                    padding: '0.6rem 1rem',
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
                    padding: '0.6rem 1.25rem',
                    background: '#0d9488',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: bookingLoading ? 'not-allowed' : 'pointer',
                    fontSize: '0.82rem',
                  }}
                >
                  {bookingLoading ? 'Submitting...' : user?.role === 'doctor' ? 'Schedule Appointment' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
