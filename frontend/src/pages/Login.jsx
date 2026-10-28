import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brain, Eye, EyeOff, ArrowRight, Lock, Mail, X, Stethoscope, UserCheck, Shield } from 'lucide-react';
import useAuthStore from '../store/authStore';
import ThemeToggle from '../components/ThemeToggle';
import { authAPI } from '../api/client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState(null);
  const { login, isLoading, error } = useAuthStore();
  const navigate = useNavigate();

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotMessage(null);
    try {
      const res = await authAPI.forgotPassword(forgotEmail);
      setForgotMessage({
        type: 'success',
        text: res.data?.message || 'If an account exists, a secure password reset link has been dispatched.',
      });
    } catch (err) {
      setForgotMessage({
        type: 'error',
        text: err.response?.data?.detail || 'Unable to request password reset.',
      });
    } finally {
      setForgotLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await login(email, password);
    if (result.success) {
      navigate(result.role === 'doctor' ? '/doctor' : '/patient');
    }
  };

  const handleDemoLogin = async (demoEmail, demoPass) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    const result = await login(demoEmail, demoPass);
    if (result.success) {
      if (result.role === 'admin') navigate('/admin');
      else if (result.role === 'doctor') navigate('/doctor');
      else navigate('/patient');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      position: 'relative',
    }}>
      {/* Theme toggle */}
      <ThemeToggle floating />

      <div style={{ width: '100%', maxWidth: 440 }} className="animate-fade-in">
        {/* Logo area */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div className="brand-logo-box brand-logo-box-lg" style={{ margin: '0 auto 1.25rem' }}>
            <Brain size={34} color="#ffffff" />
          </div>
          <h1 style={{ fontSize: '1.8rem', marginBottom: 6 }}>Welcome back</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Sign in to <span className="text-gradient-cyan" style={{ fontWeight: 600 }}>NeuroScan AI</span>
          </p>
        </div>

        {/* Glass Form Card */}
        <div className="glass-panel" style={{ padding: '2rem' }}>
          {/* Top shimmer line */}
          <div style={{
            position: 'absolute', top: 0, left: '10%', right: '10%', height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(0,229,200,0.4), transparent)',
            borderRadius: '0 0 50% 50%',
          }} />

          {error && (
            <div className="alert alert-error" style={{ marginBottom: '1.25rem' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Email field */}
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{
                  position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }} />
                <input
                  type="email"
                  className="form-input"
                  placeholder="doctor@hospital.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
            </div>

            {/* Password field */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <label className="form-label" style={{ margin: 0 }}>Password</label>
                <button
                  type="button"
                  onClick={() => { setShowForgot(true); setForgotMessage(''); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: '#38bdf8',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                >
                  Forgot password?
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{
                  position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }} />
                <input
                  type={showPass ? 'text' : 'password'}
                  className="form-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ paddingLeft: '2.5rem', paddingRight: '2.75rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                    display: 'flex', alignItems: 'center',
                    transition: 'color 0.2s',
                  }}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={isLoading}
              style={{ marginTop: '0.5rem', padding: '0.8rem' }}
            >
              {isLoading ? (
                <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Signing in...</>
              ) : (
                <>Sign In <ArrowRight size={16} /></>
              )}
            </button>
          </form>

          {/* Quick clinical demo access buttons */}
          <div style={{ marginTop: '1.25rem' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              margin: '1rem 0 0.75rem',
            }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Instant Clinical Demo
              </span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => handleDemoLogin('dr.demo@neuroscan.ai', 'DemoPass123')}
                disabled={isLoading}
                style={{
                  padding: '0.65rem 0.35rem',
                  borderRadius: 'var(--radius-md, 8px)',
                  border: '1px solid rgba(13, 148, 136, 0.35)',
                  background: 'rgba(13, 148, 136, 0.08)',
                  color: '#2dd4bf',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.2s ease',
                }}
              >
                <Stethoscope size={14} /> Doctor
              </button>

              <button
                type="button"
                onClick={() => handleDemoLogin('pt.demo@neuroscan.ai', 'DemoPass123')}
                disabled={isLoading}
                style={{
                  padding: '0.65rem 0.35rem',
                  borderRadius: 'var(--radius-md, 8px)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  background: 'rgba(56, 189, 248, 0.08)',
                  color: '#38bdf8',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.2s ease',
                }}
              >
                <UserCheck size={14} /> Patient
              </button>

              <button
                type="button"
                onClick={() => handleDemoLogin('admin@neuroscan.ai', 'DemoPass123')}
                disabled={isLoading}
                style={{
                  padding: '0.65rem 0.35rem',
                  borderRadius: 'var(--radius-md, 8px)',
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  background: 'rgba(148, 163, 184, 0.08)',
                  color: '#cbd5e1',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.2s ease',
                }}
              >
                <Shield size={14} /> Admin
              </button>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <div className="divider" />
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Don't have an account?{' '}
              <Link to="/register" style={{ color: 'var(--accent-cyan)', fontWeight: 600, textDecoration: 'none' }}>
                Register here
              </Link>
            </p>
          </div>
        </div>

        {/* Security note */}
        <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: '0.75rem', color: 'var(--text-muted)',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '9999px',
            padding: '0.3rem 1rem',
          }}>
            <Lock size={11} /> End-to-end encrypted · Encrypted PHI · Secure JWT Auth
          </span>
          <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', display: 'flex', justifyContent: 'center', gap: '1rem' }}>
            <Link to="/privacy" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Privacy Policy</Link>
            <span style={{ color: 'var(--text-muted)', opacity: 0.4 }}>•</span>
            <Link to="/terms" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Terms &amp; Conditions</Link>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgot && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '1rem',
        }}>
          <div style={{
            width: '100%',
            maxWidth: '400px',
            background: '#0b1329',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '12px',
            padding: '1.75rem',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
            position: 'relative',
          }}>
            <button
              onClick={() => setShowForgot(false)}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>

            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#f8fafc' }}>
              Reset Password
            </h2>
            <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0 0 1.25rem 0' }}>
              Enter your clinical account email address. We will verify and issue a cryptographic reset link.
            </p>

            {forgotMessage && (
              <div style={{
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                fontSize: '0.82rem',
                marginBottom: '1rem',
                background: forgotMessage.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(13, 148, 136, 0.2)',
                border: `1px solid ${forgotMessage.type === 'error' ? 'rgba(239, 68, 68, 0.35)' : 'rgba(13, 148, 136, 0.4)'}`,
                color: forgotMessage.type === 'error' ? '#fca5a5' : '#5eead4',
              }}>
                {forgotMessage.text}
              </div>
            )}

            <form onSubmit={handleForgotSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.35rem' }}>
                  Registered Email Address
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                  <input
                    type="email"
                    required
                    placeholder="doctor@hospital.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.75rem 0.65rem 2.25rem',
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
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowForgot(false)}
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
                  disabled={forgotLoading}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#0d9488',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: forgotLoading ? 'not-allowed' : 'pointer',
                    fontSize: '0.82rem',
                  }}
                >
                  {forgotLoading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
