import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function PatientDetail() {
  const { patientId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (patientId) {
      navigate(`/doctor?patientId=${patientId}`, { replace: true });
    }
  }, [patientId, navigate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div className="spinner" />
      <p style={{ marginTop: '1.5rem', color: 'var(--text-secondary)' }}>Redirecting to Patient Workspace...</p>
    </div>
  );
}
