import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore';

// Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import PatientDashboard from './pages/patient/Dashboard';
import ScanUpload from './pages/patient/ScanUpload';
import MyReports from './pages/patient/MyReports';
import SymptomTracker from './pages/patient/SymptomTracker';
import AIAssistant from './pages/patient/AIAssistant';
import DoctorDashboard from './pages/doctor/Dashboard';
import PatientList from './pages/doctor/PatientList';
import PatientDetail from './pages/doctor/PatientDetail';
import Notifications from './pages/doctor/Notifications';
import Messages from './pages/Messages';

// Layout
import Sidebar from './components/Sidebar';

// ── Route Guards ──────────────────────────────────────────────────────────────

function RequireAuth({ children, role }) {
  const { user } = useAuthStore();
  const token = localStorage.getItem('access_token');

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (role && user.role !== role) {
    return <Navigate to={user.role === 'doctor' ? '/doctor' : '/patient'} replace />;
  }

  return children;
}

function AppLayout({ children }) {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}

export default function App() {
  const { user, fetchMe } = useAuthStore();

  useEffect(() => {
    // Rehydrate user on reload if token exists
    const token = localStorage.getItem('access_token');
    if (token && !user) {
      fetchMe();
    }
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Patient Routes */}
        <Route path="/patient" element={
          <RequireAuth role="patient">
            <AppLayout><PatientDashboard /></AppLayout>
          </RequireAuth>
        } />
        <Route path="/patient/scan" element={
          <RequireAuth role="patient">
            <AppLayout><ScanUpload /></AppLayout>
          </RequireAuth>
        } />
        <Route path="/patient/reports" element={
          <RequireAuth role="patient">
            <AppLayout><MyReports /></AppLayout>
          </RequireAuth>
        } />
        <Route path="/patient/symptoms" element={
          <RequireAuth role="patient">
            <AppLayout><SymptomTracker /></AppLayout>
          </RequireAuth>
        } />
        <Route path="/patient/chatbot" element={
          <RequireAuth role="patient">
            <AppLayout><AIAssistant /></AppLayout>
          </RequireAuth>
        } />
        <Route path="/patient/messages" element={
          <RequireAuth role="patient">
            <AppLayout><Messages /></AppLayout>
          </RequireAuth>
        } />

        {/* Doctor Routes */}
        <Route path="/doctor" element={
          <RequireAuth role="doctor">
            <AppLayout><DoctorDashboard /></AppLayout>
          </RequireAuth>
        } />
        <Route path="/doctor/patients" element={
          <RequireAuth role="doctor">
            <AppLayout><PatientList /></AppLayout>
          </RequireAuth>
        } />
        <Route path="/doctor/patients/:patientId" element={
          <RequireAuth role="doctor">
            <AppLayout><PatientDetail /></AppLayout>
          </RequireAuth>
        } />
        <Route path="/doctor/messages" element={
          <RequireAuth role="doctor">
            <AppLayout><Messages /></AppLayout>
          </RequireAuth>
        } />
        <Route path="/doctor/chatbot" element={
          <RequireAuth role="doctor">
            <AppLayout><AIAssistant /></AppLayout>
          </RequireAuth>
        } />
        <Route path="/doctor/notifications" element={
          <RequireAuth role="doctor">
            <AppLayout><Notifications /></AppLayout>
          </RequireAuth>
        } />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
