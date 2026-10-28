import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Brain, Zap, Shield, Bot, ChevronRight, ChevronDown, Activity,
  Users, FileText, Sparkles, ShieldAlert, Menu, X, ArrowUp,
  Mail, CheckCircle2, AlertCircle, MessageSquare, Send
} from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';

const features = [
  {
    icon: <Bot size={24} />,
    title: 'Multi-AI Ensemble',
    desc: 'Google Gemini Vision, HuggingFace Vision, and local OpenCV pipelines analyze every scan concurrently.',
    color: 'var(--accent-cyan)',
    glow: 'rgba(0,229,200,0.15)',
  },
  {
    icon: <Shield size={24} />,
    title: 'Consensus Engine',
    desc: 'Confidence-weighted voting fuses all AI model predictions. Ambiguities trigger mandatory human review.',
    color: 'var(--accent-blue)',
    glow: 'rgba(59,130,246,0.15)',
  },
  {
    icon: <Activity size={24} />,
    title: 'Real-Time Monitoring',
    desc: 'Daily symptom tracking with automated clinical escalation alerts when neurological decline is detected.',
    color: 'var(--accent-green)',
    glow: 'rgba(34,197,94,0.15)',
  },
  {
    icon: <Users size={24} />,
    title: 'Role-Based Dual Portal',
    desc: 'Dedicated institutional workspaces for attending doctors and patients with strict privacy boundaries.',
    color: 'var(--accent-orange)',
    glow: 'rgba(249,115,22,0.15)',
  },
  {
    icon: <FileText size={24} />,
    title: 'Dual Clinical Reports',
    desc: 'Gemini Pro generates two tailored report tiers: technical for radiologists, plain language for patients.',
    color: 'var(--accent-pink)',
    glow: 'rgba(236,72,153,0.15)',
  },
  {
    icon: <Zap size={24} />,
    title: '24/7 Cloud Architecture',
    desc: 'Scalable deployment across Vercel, Render, and Supabase for continuous clinical availability.',
    color: 'var(--accent-blue)',
    glow: 'rgba(59,130,246,0.15)',
  },
];

const stats = [
  { value: '3+', label: 'AI Models', icon: <Bot size={18} /> },
  { value: '2x', label: 'Report Tiers', icon: <FileText size={18} /> },
  { value: '~5s', label: 'Avg Latency', icon: <Zap size={18} /> },
  { value: '24/7', label: 'Cloud Uptime', icon: <Shield size={18} /> },
];

const faqs = [
  {
    q: 'Which MRI sequences and image formats are supported?',
    a: 'NeuroScan AI supports standard axial, coronal, and sagittal DICOM (.dcm) files, along with 8-bit uncompressed PNG, WebP, and JPEG exports. The model analyzes T1-weighted, T1-contrast-enhanced (T1ce), T2-weighted, and FLAIR protocols.',
  },
  {
    q: 'How does the multi-AI consensus engine operate?',
    a: 'Each uploaded scan is evaluated independently by three isolated engines: Google Gemini Vision, HuggingFace Vision, and local morphological OpenCV. Predictions are fused through a Bayesian confidence-weighting matrix. When models disagree below an 80% consensus threshold, the scan is flagged for mandatory physician adjudication.',
  },
  {
    q: 'How is patient protected health information (PHI) secured?',
    a: 'All data in transit is protected using TLS 1.3 encryption. Passwords and sessions use salted Argon2/Bcrypt and stateless JWT tokens. Uploaded imaging data can be de-identified locally before ingestion to align with HIPAA and GDPR data governance standards.',
  },
  {
    q: 'Can attending physicians edit AI-generated diagnostic reports?',
    a: 'Yes. The doctor portal includes interactive report editing. Physicians can modify provisional tumor classifications, refine anatomical region notes, and sign off with their clinical credentials before generating downloadable PDF summaries.',
  },
];

export default function Landing() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);
  const [cookieConsent, setCookieConsent] = useState(() => localStorage.getItem('neuroscan_cookie_consent'));

  // Contact form state
  const [contactForm, setContactForm] = useState({ name: '', email: '', institution: '', message: '' });
  const [contactStatus, setContactStatus] = useState({ loading: false, success: false, error: '' });

  useEffect(() => {
    const handleScroll = () => {
      const totalScroll = document.documentElement.scrollTop;
      const windowHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scrollPercent = windowHeight > 0 ? (totalScroll / windowHeight) * 100 : 0;
      setScrollProgress(scrollPercent);
      setShowBackToTop(totalScroll > 320);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleContactSubmit = (e) => {
    e.preventDefault();
    if (!contactForm.name.trim() || !contactForm.email.trim() || !contactForm.message.trim()) {
      setContactStatus({ loading: false, success: false, error: 'Please complete all required fields.' });
      return;
    }

    setContactStatus({ loading: true, success: false, error: '' });

    // Simulate clinical contact submission with sanitized payload
    setTimeout(() => {
      setContactStatus({
        loading: false,
        success: true,
        error: '',
      });
      setContactForm({ name: '', email: '', institution: '', message: '' });
    }, 700);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const acceptCookies = (choice) => {
    localStorage.setItem('neuroscan_cookie_consent', choice);
    setCookieConsent(choice);
  };

  return (
    <div style={{ minHeight: '100vh', overflowX: 'hidden', position: 'relative' }}>
      {/* ── Accessible Skip Link ── */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* ── Scroll Progress Bar ── */}
      <div
        className="scroll-progress-bar"
        style={{ width: `${scrollProgress}%` }}
        role="progressbar"
        aria-valuenow={Math.round(scrollProgress)}
        aria-valuemin="0"
        aria-valuemax="100"
      />

      {/* ── Header ── */}
      <header
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1.25rem 2.5rem',
          position: 'sticky', top: 0, zIndex: 100,
          background: 'var(--header-bg)',
          backdropFilter: 'blur(30px) saturate(180%)',
          WebkitBackdropFilter: 'blur(30px) saturate(180%)',
          borderBottom: '1px solid var(--border-subtle)',
          boxShadow: '0 4px 30px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="brand-logo-box brand-logo-box-md">
            <Brain size={22} color="#ffffff" />
          </div>
          <div>
            <div
              style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: '1.05rem' }}
              className="text-gradient-cyan"
            >
              NeuroScan AI
            </div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Clinical Decision Suite
            </div>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav style={{ display: 'none', gap: '1.5rem', alignItems: 'center' }} className="desktop-nav">
          <a href="#features" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}>
            Features
          </a>
          <a href="#faq" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}>
            FAQ
          </a>
          <a href="#contact" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}>
            Contact
          </a>
        </nav>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <ThemeToggle />
          <Link to="/login" className="btn btn-ghost btn-sm">Sign In</Link>
          <Link to="/register" className="btn btn-primary btn-sm">
            Get Started <ChevronRight size={14} />
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              padding: '0.4rem',
            }}
            aria-label="Toggle mobile menu"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      {/* ── Mobile Navigation Drawer ── */}
      {mobileMenuOpen && (
        <div className="mobile-nav-drawer glass-panel" style={{ zIndex: 1000 }}>
          <a
            href="#features"
            onClick={() => setMobileMenuOpen(false)}
            style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600, padding: '0.5rem 0' }}
          >
            Clinical Features
          </a>
          <a
            href="#faq"
            onClick={() => setMobileMenuOpen(false)}
            style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600, padding: '0.5rem 0' }}
          >
            Clinical FAQ
          </a>
          <a
            href="#contact"
            onClick={() => setMobileMenuOpen(false)}
            style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600, padding: '0.5rem 0' }}
          >
            Contact &amp; Inquiries
          </a>
          <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '0.5rem 0' }} />
          <Link
            to="/login"
            onClick={() => setMobileMenuOpen(false)}
            className="btn btn-secondary w-full"
            style={{ justifyContent: 'center' }}
          >
            Provider Sign In
          </Link>
          <Link
            to="/register"
            onClick={() => setMobileMenuOpen(false)}
            className="btn btn-primary w-full"
            style={{ justifyContent: 'center' }}
          >
            Register Patient / Provider
          </Link>
        </div>
      )}

      {/* ── Main Content Target ── */}
      <main id="main-content">
        {/* ── Hero ── */}
        <section
          style={{
            padding: '7rem 2rem 5rem',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div className="animate-fade-in" style={{ position: 'relative', maxWidth: 820, margin: '0 auto' }}>
            <div
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '0.45rem 1.1rem',
                background: 'rgba(0,229,200,0.08)',
                border: '1px solid rgba(0,229,200,0.22)',
                borderRadius: '9999px',
                fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent-cyan)',
                marginBottom: '2rem',
                backdropFilter: 'blur(10px)',
                boxShadow: '0 0 20px rgba(0,229,200,0.10)',
              }}
            >
              <Sparkles size={13} />
              Clinical Decision Support: Multi-Model Radiographic Ensemble
            </div>

            <h1
              style={{
                fontSize: 'clamp(2.6rem, 6.5vw, 4.2rem)',
                lineHeight: 1.1,
                marginBottom: '1.75rem',
                fontFamily: 'Space Grotesk',
                fontWeight: 800,
              }}
            >
              <span className="text-gradient-hero">Radiographic Brain Tumor</span>
              <br />
              <span style={{ color: 'var(--text-primary)' }}>Diagnostic Intelligence</span>
            </h1>

            <p
              style={{
                fontSize: '1.1rem', color: 'var(--text-secondary)',
                maxWidth: 580, margin: '0 auto 3rem',
                lineHeight: 1.75,
              }}
            >
              Multiple deep learning models independently evaluate every MRI scan across axial,
              coronal, and sagittal planes. Predictions are synthesized through confidence-weighted
              consensus to assist attending radiologists.
            </p>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to="/register" className="btn btn-primary btn-xl animate-pulse-glow">
                Start Analysis <ChevronRight size={18} />
              </Link>
              <Link to="/login" className="btn btn-secondary btn-xl">
                Provider Sign In
              </Link>
            </div>
          </div>
        </section>

        {/* ── Stats ── */}
        <section style={{ padding: '0 2rem 4rem', maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            {stats.map((stat, i) => (
              <div
                key={stat.label}
                className="neu-card animate-fade-in"
                style={{
                  textAlign: 'center', padding: '1.5rem 1rem',
                  animationDelay: `${i * 0.1}s`,
                  background: 'var(--overlay-soft)',
                  backdropFilter: 'blur(20px)',
                }}
              >
                <div
                  style={{
                    width: 40, height: 40,
                    borderRadius: 10,
                    background: 'rgba(0,229,200,0.08)',
                    border: '1px solid rgba(0,229,200,0.18)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--accent-cyan)',
                    margin: '0 auto 0.75rem',
                    boxShadow: '0 0 15px rgba(0,229,200,0.12)',
                  }}
                >
                  {stat.icon}
                </div>
                <div
                  style={{ fontSize: '2rem', fontWeight: 900, fontFamily: 'Space Grotesk' }}
                  className="text-gradient-cyan"
                >
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
        <section id="features" style={{ padding: '2rem 2rem 5rem', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <h2 style={{ marginBottom: '0.75rem' }}>Built for <span className="text-gradient-cyan">Clinical Precision</span></h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
              Every component engineered for diagnostic accountability and radiological safety.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
            {features.map((feat, i) => (
              <div
                key={feat.title}
                className="glass-card animate-fade-in"
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                <div
                  style={{
                    width: 50, height: 50, borderRadius: 14,
                    background: feat.glow,
                    border: `1px solid ${feat.color}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: feat.color, marginBottom: '1rem',
                    boxShadow: `0 0 20px ${feat.glow}`,
                  }}
                >
                  {feat.icon}
                </div>
                <h4 style={{ marginBottom: 8, fontFamily: 'Space Grotesk' }}>{feat.title}</h4>
                <p style={{ fontSize: '0.875rem', lineHeight: 1.65, color: 'var(--text-secondary)' }}>{feat.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Clinical FAQ Section ── */}
        <section id="faq" style={{ padding: '2rem 2rem 5rem', maxWidth: 840, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <h2 style={{ marginBottom: '0.75rem' }}>Frequently Asked <span className="text-gradient-cyan">Questions</span></h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
              Technical and clinical details regarding algorithm architecture and patient security.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div key={faq.q} className={`faq-accordion-item ${isOpen ? 'open' : ''}`}>
                  <button
                    type="button"
                    className="faq-question-btn"
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    aria-expanded={isOpen}
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      size={18}
                      style={{
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.25s ease',
                        flexShrink: 0,
                        marginLeft: 12,
                      }}
                    />
                  </button>
                  {isOpen && (
                    <div className="faq-answer-panel">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Contact & Institutional Inquiry ── */}
        <section id="contact" style={{ padding: '2rem 2rem 5rem', maxWidth: 840, margin: '0 auto' }}>
          <div className="glass-panel" style={{ padding: '3rem 2rem' }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div className="brand-logo-box brand-logo-box-md" style={{ margin: '0 auto 1rem' }}>
                <Mail size={22} color="#ffffff" />
              </div>
              <h2 style={{ marginBottom: '0.5rem' }}>Clinical &amp; Technical Inquiries</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: 500, margin: '0 auto' }}>
                Connect with our medical informatics team for research partnerships, institutional deployments, or API access.
              </p>
            </div>

            {contactStatus.success && (
              <div className="alert alert-success" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: 10 }}>
                <CheckCircle2 size={18} />
                <span>Thank you. Your inquiry has been routed to our medical engineering team. We will respond within 24 business hours.</span>
              </div>
            )}

            {contactStatus.error && (
              <div className="alert alert-error" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertCircle size={18} />
                <span>{contactStatus.error}</span>
              </div>
            )}

            <form onSubmit={handleContactSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Dr. Jordan Hayes"
                    value={contactForm.name}
                    onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Institutional Email *</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="j.hayes@medicalcenter.org"
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Hospital, University, or Institution</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Department of Neurological Surgery"
                  value={contactForm.institution}
                  onChange={(e) => setContactForm({ ...contactForm, institution: e.target.value })}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">Inquiry Details *</label>
                <textarea
                  className="form-input"
                  rows={4}
                  placeholder="Specify clinical protocol requirements, volume integration, or questions..."
                  value={contactForm.message}
                  onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                  required
                  style={{ resize: 'vertical' }}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full"
                disabled={contactStatus.loading}
                style={{ justifyContent: 'center', padding: '0.85rem' }}
              >
                {contactStatus.loading ? (
                  <>
                    <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    Sending Inquiry...
                  </>
                ) : (
                  <>
                    Submit Clinical Inquiry <Send size={16} />
                  </>
                )}
              </button>
            </form>
          </div>
        </section>

        {/* ── Final Call to Action ── */}
        <section style={{ padding: '3rem 2rem 5rem', textAlign: 'center' }}>
          <div className="glass-panel" style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center', padding: '3rem 2rem' }}>
            <div className="brand-logo-box brand-logo-box-xl" style={{ margin: '0 auto 1.5rem' }}>
              <Brain size={30} color="#ffffff" />
            </div>
            <h2 style={{ marginBottom: '1rem' }}>Deploy Diagnostic Decision Support</h2>
            <p style={{ color: 'var(--text-muted)', maxWidth: 460, margin: '0 auto 2rem', lineHeight: 1.7 }}>
              Immediate access to multi-model radiographic consensus, volumetric measurement, and automated report drafting.
            </p>
            <Link to="/register" className="btn btn-primary btn-xl">
              Create Clinical Account <ChevronRight size={18} />
            </Link>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer
        style={{
          padding: '2.5rem 2rem 2rem',
          borderTop: '1px solid var(--border-subtle)',
          textAlign: 'center',
          fontSize: '0.82rem',
          color: 'var(--text-muted)',
          background: 'var(--footer-bg)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <div style={{ maxWidth: 840, margin: '0 auto' }}>
          <p style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap', lineHeight: 1.6 }}>
            <ShieldAlert size={16} color="var(--accent-amber)" style={{ verticalAlign: '-2px', flexShrink: 0 }} />
            <span>
              <strong style={{ color: 'var(--text-secondary)' }}>Medical Disclaimer:</strong> NeuroScan AI is an investigational clinical decision-support platform. All radiographic interpretations must be verified by a board-certified neuroradiologist or attending physician before clinical decisions are made.
            </span>
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1.75rem', margin: '1.5rem 0 0.75rem', flexWrap: 'wrap', fontWeight: 500 }}>
            <Link to="/privacy" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Privacy Policy</Link>
            <Link to="/terms" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Terms &amp; Conditions</Link>
            <Link to="/login" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Provider Portal</Link>
            <Link to="/register" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Patient Registration</Link>
          </div>
          <p style={{ marginTop: 12, fontSize: '0.75rem', opacity: 0.65 }}>
            NeuroScan AI &copy; {new Date().getFullYear()} &middot; Clinical Decision Support &middot; All Rights Reserved
          </p>
        </div>
      </footer>

      {/* ── Floating Actions Dock ── */}
      <div className="floating-actions-dock">
        <a
          href="#contact"
          className="floating-btn"
          title="Clinical Inquiry"
          aria-label="Scroll to contact form"
        >
          <MessageSquare size={18} />
        </a>
        {showBackToTop && (
          <button
            type="button"
            className="floating-btn"
            onClick={scrollToTop}
            title="Back to Top"
            aria-label="Back to top"
          >
            <ArrowUp size={18} />
          </button>
        )}
      </div>

      {/* ── Cookie Consent Banner ── */}
      {!cookieConsent && (
        <aside className="cookie-banner" aria-label="Cookie and data policy">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <Shield size={20} color="var(--accent-cyan)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 4, color: 'var(--text-primary)' }}>
                Session &amp; Diagnostic Data Notice
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '0.75rem' }}>
                NeuroScan AI uses essential session cookies and local storage tokens to maintain authenticated sessions and preserve radiologic viewing preferences in compliance with data privacy standards.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => acceptCookies('accepted')}
                >
                  Accept &amp; Continue
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => acceptCookies('essential_only')}
                >
                  Essential Only
                </button>
              </div>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
