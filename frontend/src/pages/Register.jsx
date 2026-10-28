import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brain, ArrowRight, UserCog, User, Mail, Lock, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import useAuthStore from '../store/authStore';
import ThemeToggle from '../components/ThemeToggle';

export default function Register() {
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'patient' });
  const [showPass, setShowPass] = useState(false);
  const [success, setSuccess] = useState(false);
  const { register, login, isLoading, error } = useAuthStore();
  const navigate = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await register(form);
    if (result.success) {
      setSuccess(true);
      // Automatically log the user in immediately so they never have to manually log in
      const loginRes = await login(form.email, form.password);
      if (loginRes.success) {
        setTimeout(() => {
          navigate(loginRes.role === 'doctor' ? '/doctor' : '/patient');
        }, 1200);
      } else {
        setTimeout(() => navigate('/login'), 1500);
      }
    }
  };

  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="glass-panel animate-scale-in" style={{ textAlign: 'center', padding: '3rem', maxWidth: 400 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'rgba(13,148,136,0.12)',
            border: '1px solid rgba(13,148,136,0.30)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.25rem',
            boxShadow: '0 0 30px rgba(13,148,136,0.20)',
          }}>
            <CheckCircle2 size={36} color="#0d9488" />
          </div>
          <h2 style={{ marginBottom: 8 }}>Account Created!</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Signing you into your clinical dashboard...</p>
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

      <div style={{ width: '100%', maxWidth: 460 }} className="animate-fade-in">
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div className="brand-logo-box brand-logo-box-lg" style={{ margin: '0 auto 1.25rem' }}>
            <Brain size={34} color="#ffffff" />
          </div>
          <h1 style={{ fontSize: '1.8rem', marginBottom: 6 }}>Create Account</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Join <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>NeuroScan AI</span> Platform
          </p>
        </div>

        {/* Glass Form Card */}
        <div className="glass-panel" style={{ padding: '2rem', position: 'relative' }}>
          <div style={{
            position: 'absolute', top: 0, left: '10%', right: '10%', height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(0,229,200,0.4), transparent)',
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
                      border: `1px solid ${form.role === opt.value ? 'rgba(0,229,200,0.35)' : 'rgba(255,255,255,0.07)'}`,
                      background: form.role === opt.value
                        ? 'rgba(0,229,200,0.10)'
                        : 'rgba(255,255,255,0.03)',
                      color: form.role === opt.value ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', gap: 6,
                      fontWeight: 600, fontSize: '0.875rem',
                      transition: 'all 0.25s cubic-bezier(0.34,1.56,0.64,1)',
                      boxShadow: form.role === opt.value
                        ? 'inset 3px 3px 8px rgba(0,0,0,0.5), inset -2px -2px 6px rgba(255,255,255,0.03), 0 0 20px rgba(0,229,200,0.12)'
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
                <input
                  type={showPass ? 'text' : 'password'}
                  name="password"
                  className="form-input"
                  placeholder="Min. 8 chars, 1 uppercase, 1 number"
                  value={form.password}
                  onChange={handleChange}
                  required
                  minLength={8}
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
                  aria-label={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Must contain at least one uppercase letter and one digit.
              </div>
            </div>

            <button type="submit" className="btn btn-primary w-full" disabled={isLoading} style={{ marginTop: '0.5rem', padding: '0.8rem' }}>
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
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
              By creating an account, you agree to our{' '}
              <Link to="/terms" style={{ color: 'var(--text-secondary)', textDecoration: 'underline' }}>Terms of Service</Link>{' '}
              and{' '}
              <Link to="/privacy" style={{ color: 'var(--text-secondary)', textDecoration: 'underline' }}>Privacy Policy</Link>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
