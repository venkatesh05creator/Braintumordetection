import React from 'react';
import AppointmentsList from '../components/AppointmentsList';

export default function AppointmentsPage() {
  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <AppointmentsList />
    </div>
  );
}
