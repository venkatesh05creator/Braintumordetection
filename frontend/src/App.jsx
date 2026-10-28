import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore';

// Layout
import Sidebar from './components/Sidebar';

// Lazy-Loaded Pages for Optimized Code-Splitting
const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsConditions = lazy(() => import('./pages/TermsConditions'));

// Patient Pages
const PatientDashboard = lazy(() => import('./pages/patient/Dashboard'));
const ScanUpload = lazy(() => import('./pages/patient/ScanUpload'));
const MyReports = lazy(() => import('./pages/patient/MyReports'));
const SymptomTracker = lazy(() => import('./pages/patient/SymptomTracker'));
const AIAssistant = lazy(() => import('./pages/patient/AIAssistant'));

// Doctor Pages
const DoctorDashboard = lazy(() => import('./pages/doctor/Dashboard'));
const PatientList = lazy(() => import('./pages/doctor/PatientList'));
const PatientDetail = lazy(() => import('./pages/doctor/PatientDetail'));
const Notifications = lazy(() => import('./pages/doctor/Notifications'));

// Shared & Admin
const Messages = lazy(() => import('./pages/Messages'));
const AppointmentsPage = lazy(() => import('./pages/AppointmentsPage'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));

// ── Fallback Loader ───────────────────────────────────────────────────────────

function ClinicalLoadingFallback() {
  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.75rem',
      color: '#94a3b8',
      fontSize: '0.85rem',
    }}>
      <div style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        border: '3px solid rgba(13, 148, 136, 0.2)',
        borderTopColor: '#0d9488',
        animation: 'spin 0.8s linear infinite',
      }} />
      <span>Loading clinical interface...</span>
    </div>
  );
}

// ── Route Guards ──────────────────────────────────────────────────────────────

function RequireAuth({ children, role }) {
  const { user } = useAuthStore();
  const token = localStorage.getItem('access_token');

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (role && user.role !== role) {
    if (user.role === 'admin') return <Navigate to="/admin" replace />;
    if (user.role === 'doctor') return <Navigate to="/doctor" replace />;
    return <Navigate to="/patient" replace />;
  }

  return children;
}

function AppLayout({ children }) {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Suspense fallback={<ClinicalLoadingFallback />}>
          {children}
        </Suspense>
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
  }, [fetchMe, user]);

  return (
    <BrowserRouter>
      <Suspense fallback={<ClinicalLoadingFallback />}>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsConditions />} />

          {/* Admin Routes */}
          <Route path="/admin" element={
            <RequireAuth role="admin">
              <AppLayout><AdminDashboard /></AppLayout>
            </RequireAuth>
          } />

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
          <Route path="/patient/appointments" element={
            <RequireAuth role="patient">
              <AppLayout><AppointmentsPage /></AppLayout>
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
          <Route path="/doctor/appointments" element={
            <RequireAuth role="doctor">
              <AppLayout><AppointmentsPage /></AppLayout>
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
      </Suspense>
    </BrowserRouter>
  );
}
