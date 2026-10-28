import React from 'react';
import { Calendar, Stethoscope, Clock, ShieldCheck } from 'lucide-react';
import AppointmentsList from '../components/AppointmentsList';
import useAuthStore from '../store/authStore';

export default function AppointmentsPage() {
  const { user } = useAuthStore();
  const isDoctor = user?.role === 'doctor';

  return (
    <div className="page-container" style={{ padding: '1.75rem 2rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Clinical Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1.75rem',
        paddingBottom: '1.25rem',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem' }}>
            <div style={{
              width: 34,
              height: 34,
              borderRadius: '8px',
              background: 'rgba(13, 148, 136, 0.15)',
              border: '1px solid rgba(13, 148, 136, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0d9488',
            }}>
              <Calendar size={18} />
            </div>
            <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.02em' }}>
              {isDoctor ? 'Clinical Consultations & Schedules' : 'Specialist Consultations'}
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: '0.86rem', color: '#94a3b8' }}>
            {isDoctor
              ? 'Manage patient appointments, scheduled MRI reviews, and follow-up clinical evaluations.'
              : 'Book and manage one-on-one appointments with your attending neuro-oncology team.'}
          </p>
        </div>

        {/* Status Pill */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.45rem 0.85rem',
          borderRadius: '9999px',
          background: 'rgba(13, 148, 136, 0.10)',
          border: '1px solid rgba(13, 148, 136, 0.25)',
          color: '#2dd4bf',
          fontSize: '0.78rem',
          fontWeight: 600,
        }}>
          <ShieldCheck size={14} />
          <span>Encrypted Clinical Scheduling</span>
        </div>
      </div>

      {/* Main Appointments Engine */}
      <AppointmentsList />
    </div>
  );
}
