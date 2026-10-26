import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brain, ArrowRight, UserCog, User, Mail, Lock, Sparkles, CheckCircle2 } from 'lucide-react';
import useAuthStore from '../store/authStore';
import ThemeToggle from '../components/ThemeToggle';

export default function Register() {
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'patient' });
  const [success, setSuccess] = useState(false);
  const { register, isLoading, error } = useAuthStore();
  const navigate = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await register(form);
    if (result.success) {
      setSuccess(true);
      setTimeout(() => navigate('/login'), 1800);
    }
  };

  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="orb-container"><div className="orb orb-1" /><div className="orb orb-2" /></div>
        <div className="glass-panel animate-scale-in" style={{ textAlign: 'center', padding: '3rem', maxWidth: 380 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'rgba(34,197,94,0.12)',
            border: '1px solid rgba(34,197,94,0.30)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.25rem',
            boxShadow: '0 0 30px rgba(34,197,94,0.20)',
          }}>
            <CheckCircle2 size={36} color="var(--accent-green)" />
          </div>
          <h2 style={{ marginBottom: 8 }}>Account Created!</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Redirecting to sign in...</p>
        </div>
      </div>
    );
  }

  const roles = [
    { value: 'patient', icon: <User size={22} />, label: 'Patient', desc: 'Track my health' },
    { value: 'doctor', icon: <UserCog size={22} />, label: 'Doctor', desc: 'Manage patients' },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', position: 'relative' }}>
      {/* Theme toggle */}
      <ThemeToggle floating />

      <div className="orb-container">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
      </div>

      <div style={{ width: '100%', maxWidth: 460 }} className="animate-fade-in">
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div className="brand-logo-box brand-logo-box-lg" style={{ margin: '0 auto 1.25rem' }}>
            <Brain size={34} color="#ffffff" />
          </div>
          <h1 style={{ fontSize: '1.8rem', marginBottom: 6 }}>Create Account</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Join <span style={{ color: 'var(--accent-purple)', fontWeight: 600 }}>NeuroScan AI</span> Platform
          </p>
        </div>

        {/* Glass Form Card */}
        <div className="glass-panel" style={{ padding: '2rem', position: 'relative' }}>
          <div style={{
            position: 'absolute', top: 0, left: '10%', right: '10%', height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.4), transparent)',
          }} />

          {error && (
            <div className="alert alert-error" style={{ marginBottom: '1.25rem' }}>{error}</div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Role selector */}
            <div className="form-group">
              <label className="form-label">I am a...</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {roles.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm({ ...form, role: opt.value })}
                    style={{
                      padding: '1rem 0.75rem',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${form.role === opt.value ? 'rgba(168,85,247,0.30)' : 'rgba(255,255,255,0.07)'}`,
                      background: form.role === opt.value
                        ? 'rgba(168,85,247,0.12)'
                        : 'rgba(255,255,255,0.03)',
                      color: form.role === opt.value ? 'var(--accent-purple)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', gap: 6,
                      fontWeight: 600, fontSize: '0.875rem',
                      transition: 'all 0.25s cubic-bezier(0.34,1.56,0.64,1)',
                      boxShadow: form.role === opt.value
                        ? 'inset 3px 3px 8px rgba(0,0,0,0.5), inset -2px -2px 6px rgba(255,255,255,0.03), 0 0 20px rgba(168,85,247,0.12)'
                        : '4px 4px 12px rgba(0,0,0,0.4), -2px -2px 8px rgba(255,255,255,0.04)',
                    }}
                  >
                    {opt.icon}
                    <span>{opt.label}</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 400, opacity: 0.7 }}>{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Full name */}
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <div style={{ position: 'relative' }}>
                <User size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type="text" name="full_name" className="form-input"
                  placeholder="Dr. Jane Smith" value={form.full_name}
                  onChange={handleChange} required minLength={2}
                  style={{ paddingLeft: '2.5rem' }} />
              </div>
            </div>

            {/* Email */}
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type="email" name="email" className="form-input"
                  placeholder="doctor@hospital.com" value={form.email}
                  onChange={handleChange} required
                  style={{ paddingLeft: '2.5rem' }} />
              </div>
            </div>

            {/* Password */}
            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type="password" name="password" className="form-input"
                  placeholder="Min. 8 chars, 1 uppercase, 1 number" value={form.password}
                  onChange={handleChange} required minLength={8}
                  style={{ paddingLeft: '2.5rem' }} />
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Must contain at least one uppercase letter and one digit.
              </div>
            </div>

            <button type="submit" className="btn btn-primary w-full" disabled={isLoading} style={{ marginTop: '0.5rem', padding: '0.8rem', background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-blue))' }}>
              {isLoading ? (
                <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Creating account...</>
              ) : (
                <>Create Account <ArrowRight size={16} /></>
              )}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <div className="divider" />
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Already have an account?{' '}
              <Link to="/login" style={{ color: 'var(--accent-cyan)', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
