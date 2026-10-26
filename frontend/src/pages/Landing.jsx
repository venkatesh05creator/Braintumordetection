import React from 'react';
import { Link } from 'react-router-dom';
import { Brain, Zap, Shield, Bot, ChevronRight, Activity, Users, FileText, Sparkles } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';

const features = [
  {
    icon: <Bot size={24} />,
    title: 'Multi-AI Ensemble',
    desc: 'Google Gemini Vision + HuggingFace + Local CV analyze every scan simultaneously for maximum accuracy.',
    color: 'var(--accent-cyan)',
    glow: 'rgba(0,229,200,0.15)',
  },
  {
    icon: <Shield size={24} />,
    title: 'Consensus Engine',
    desc: 'Confidence-weighted voting fuses all AI outputs. Disagreements trigger mandatory human review.',
    color: 'var(--accent-purple)',
    glow: 'rgba(168,85,247,0.15)',
  },
  {
    icon: <Activity size={24} />,
    title: 'Real-time Monitoring',
    desc: 'Daily symptom tracking with automatic escalation alerts when neurological deterioration is detected.',
    color: 'var(--accent-green)',
    glow: 'rgba(34,197,94,0.15)',
  },
  {
    icon: <Users size={24} />,
    title: 'Dual Portal',
    desc: 'Separate secure interfaces for doctors and patients with role-based access control.',
    color: 'var(--accent-orange)',
    glow: 'rgba(249,115,22,0.15)',
  },
  {
    icon: <FileText size={24} />,
    title: 'AI Clinical Reports',
    desc: 'Gemini Pro generates two report versions — technical for doctors, plain-language for patients.',
    color: 'var(--accent-pink)',
    glow: 'rgba(236,72,153,0.15)',
  },
  {
    icon: <Zap size={24} />,
    title: '24/7 Cloud Availability',
    desc: 'Deployed on Render + Vercel + Supabase — always-on, globally accessible, zero downtime.',
    color: 'var(--accent-blue)',
    glow: 'rgba(59,130,246,0.15)',
  },
];

// Honest, verifiable claims only — no fabricated performance numbers.
// Every scan produces two report versions, one for each portal.
const stats = [
  { value: '3+', label: 'AI Models', icon: <Bot size={18} /> },
  { value: '2×', label: 'Report Versions', icon: <FileText size={18} /> },
  { value: '~5s', label: 'Inference', icon: <Zap size={18} /> },
  { value: '24/7', label: 'Availability', icon: <Shield size={18} /> },
];

export default function Landing() {
  return (
    <div style={{ minHeight: '100vh', overflowX: 'hidden' }}>
      {/* Floating orbs */}
      <div className="orb-container">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      {/* ── Header ── */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1.25rem 2.5rem',
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--header-bg)',
        backdropFilter: 'blur(30px) saturate(180%)',
        WebkitBackdropFilter: 'blur(30px) saturate(180%)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 4px 30px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="brand-logo-box brand-logo-box-md">
            <Brain size={22} color="#ffffff" />
          </div>
          <div>
            <div style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: '1.05rem' }}
              className="text-gradient-cyan">NeuroScan AI</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Diagnostic Suite
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <ThemeToggle />
          <Link to="/login" className="btn btn-ghost btn-sm">Sign In</Link>
          <Link to="/register" className="btn btn-primary btn-sm">Get Started <ChevronRight size={14} /></Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section style={{
        padding: '7rem 2rem 5rem',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div className="animate-fade-in" style={{ position: 'relative', maxWidth: 820, margin: '0 auto' }}>
          {/* Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '0.45rem 1.1rem',
            background: 'rgba(0,229,200,0.08)',
            border: '1px solid rgba(0,229,200,0.22)',
            borderRadius: '9999px',
            fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent-cyan)',
            marginBottom: '2rem',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 0 20px rgba(0,229,200,0.10)',
          }}>
            <Sparkles size={13} />
            Powered by Multi-AI Ensemble — Gemini + HuggingFace + Local CV
          </div>

          <h1 style={{
            fontSize: 'clamp(2.8rem, 7vw, 4.5rem)',
            lineHeight: 1.08,
            marginBottom: '1.75rem',
            fontFamily: 'Space Grotesk',
            fontWeight: 800,
          }}>
            <span className="text-gradient-hero">AI-Powered Brain Tumor</span>
            <br />
            <span style={{ color: 'var(--text-primary)' }}>Analysis Platform</span>
          </h1>

          <p style={{
            fontSize: '1.1rem', color: 'var(--text-secondary)',
            maxWidth: 580, margin: '0 auto 3rem',
            lineHeight: 1.75,
          }}>
            Multiple AI models independently analyze every MRI scan. Their outputs are
            fused through a consensus engine to deliver maximally accurate, clinically
            trustworthy diagnoses — 24/7, from anywhere in the world.
          </p>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/register" className="btn btn-primary btn-xl animate-pulse-glow">
              Start Free Analysis <ChevronRight size={18} />
            </Link>
            <Link to="/login" className="btn btn-secondary btn-xl">
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section style={{ padding: '0 2rem 4rem', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
          {stats.map((stat, i) => (
            <div key={stat.label} className="neu-card animate-fade-in" style={{
              textAlign: 'center', padding: '1.5rem 1rem',
              animationDelay: `${i * 0.1}s`,
              background: 'var(--overlay-soft)',
              backdropFilter: 'blur(20px)',
            }}>
              <div style={{
                width: 40, height: 40,
                borderRadius: 10,
                background: 'rgba(0,229,200,0.08)',
                border: '1px solid rgba(0,229,200,0.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--accent-cyan)',
                margin: '0 auto 0.75rem',
                boxShadow: '0 0 15px rgba(0,229,200,0.12)',
              }}>
                {stat.icon}
              </div>
              <div style={{
                fontSize: '2rem', fontWeight: 900,
                fontFamily: 'Space Grotesk',
              }} className="text-gradient-cyan">
                {stat.value}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section style={{ padding: '2rem 2rem 5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h2 style={{ marginBottom: '0.75rem' }}>Built for <span className="text-gradient-cyan">Clinical Excellence</span></h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            Every feature designed with medical accuracy and patient safety in mind.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
          {features.map((feat, i) => (
            <div key={feat.title} className="glass-card animate-fade-in" style={{
              animationDelay: `${i * 0.08}s`,
            }}>
              <div style={{
                width: 50, height: 50, borderRadius: 14,
                background: feat.glow,
                border: `1px solid ${feat.color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: feat.color, marginBottom: '1rem',
                boxShadow: `0 0 20px ${feat.glow}`,
              }}>
                {feat.icon}
              </div>
              <h4 style={{ marginBottom: 8, fontFamily: 'Space Grotesk' }}>{feat.title}</h4>
              <p style={{ fontSize: '0.875rem', lineHeight: 1.65, color: 'var(--text-secondary)' }}>{feat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: '5rem 2rem', textAlign: 'center' }}>
        <div className="glass-panel" style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center', padding: '3rem' }}>
          <div className="brand-logo-box brand-logo-box-xl" style={{ margin: '0 auto 1.5rem' }}>
            <Brain size={30} color="#ffffff" />
          </div>
          <h2 style={{ marginBottom: '1rem' }}>Start Analyzing Today</h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: 460, margin: '0 auto 2rem', lineHeight: 1.7 }}>
            Free to use. No credit card required. Powered by free-tier Google Gemini, HuggingFace, and Cloudinary APIs.
          </p>
          <Link to="/register" className="btn btn-primary btn-xl">
            Create Free Account <ChevronRight size={18} />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        padding: '1.5rem 2.5rem',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        textAlign: 'center',
        fontSize: '0.78rem',
        color: 'var(--text-muted)',
        background: 'var(--footer-bg)',
        backdropFilter: 'blur(20px)',
      }}>
        <p>
          ⚠️ <strong style={{ color: 'var(--text-secondary)' }}>Medical Disclaimer:</strong> NeuroScan AI is a clinical decision-support tool only.
          All AI results must be reviewed by a qualified medical professional.
        </p>
        <p style={{ marginTop: 8, opacity: 0.6 }}>
          Built with ASE-OS Autonomous Engineering Framework · Academic & Research License
        </p>
      </footer>
    </div>
  );
}
