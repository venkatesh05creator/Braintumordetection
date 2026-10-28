import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, Lock, FileText, CheckCircle2, Database, UserCheck, ArrowLeft, Brain } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';

export default function PrivacyPolicy() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1.25rem 2.5rem',
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--header-bg)',
        backdropFilter: 'blur(30px) saturate(180%)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="brand-logo-box brand-logo-box-md">
            <Brain size={22} color="#ffffff" />
          </div>
          <div>
            <div style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: '1.05rem' }} className="text-gradient-cyan">
              NeuroScan AI
            </div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Legal &amp; Compliance
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <ThemeToggle />
          <Link to="/" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={14} /> Back to Home
          </Link>
          <Link to="/login" className="btn btn-primary btn-sm">Sign In</Link>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: 880, margin: '0 auto', padding: '3.5rem 2rem 5rem' }}>
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '0.4rem 1rem', borderRadius: 9999,
            background: 'var(--accent-cyan-dim)', border: '1px solid var(--accent-cyan-border)',
            color: 'var(--accent-cyan)', fontSize: '0.8rem', fontWeight: 600, marginBottom: '1rem',
          }}>
            <Shield size={14} />
            Data Protection and Privacy Protocol
          </div>
          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 2.75rem)', fontFamily: 'Space Grotesk', marginBottom: '0.75rem' }}>
            Privacy Policy
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Last revised: October 20, 2026 &middot; Effective immediately for all clinicians and patients
          </p>
        </div>

        <div className="glass-panel" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
          {/* Section 1 */}
          <section>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.75rem', fontSize: '1.25rem' }}>
              <Lock size={20} color="var(--accent-cyan)" />
              1. Commitment to Health Data Security
            </h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.95rem' }}>
              NeuroScan AI provides clinical decision-support infrastructure for neuro-oncology imaging and patient monitoring. We recognize that medical imaging, diagnostic hypotheses, and symptom tracking records represent sensitive Protected Health Information (PHI). We maintain stringent administrative, physical, and technical safeguards designed to preserve data confidentiality, integrity, and availability.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.75rem', fontSize: '1.25rem' }}>
              <Database size={20} color="var(--accent-cyan)" />
              2. Information We Collect
            </h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.95rem', marginBottom: '0.75rem' }}>
              Our platform processes the following categories of data solely to provide clinical decision support and care coordination:
            </p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.95rem', paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li>
                <strong style={{ color: 'var(--text-primary)' }}>Account Credentials:</strong> Full name, institutional or personal email address, authenticated password hashes, and assigned role (Attending Physician or Patient).
              </li>
              <li>
                <strong style={{ color: 'var(--text-primary)' }}>Radiological Imaging Data:</strong> Magnetic Resonance Imaging (MRI) scans uploaded in supported formats (DICOM, NIfTI, PNG, and JPEG), including volumetric slice parameters and scan metadata.
              </li>
              <li>
                <strong style={{ color: 'var(--text-primary)' }}>Clinical Observations:</strong> Daily neurological symptom ratings, headache frequency, motor impairment scales, Karnofsky Performance Scale (KPS) scores, and clinician verification verdicts.
              </li>
              <li>
                <strong style={{ color: 'var(--text-primary)' }}>Consultation Logs:</strong> Secure messages exchanged between patients and their assigned attending neuro-oncology clinicians.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.75rem', fontSize: '1.25rem' }}>
              <CheckCircle2 size={20} color="var(--accent-cyan)" />
              3. AI Inference and Zero-Training Guarantee
            </h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.95rem' }}>
              Our multi-model ensemble (Google Gemini Pro Vision, Hugging Face biomedical models, and local computer vision pipelines) processes radiological scans statelessly. Scans uploaded to NeuroScan AI are strictly utilized for immediate radiographic segmentation, probability estimation, and structured clinical report generation. 
            </p>
            <div style={{
              background: 'var(--accent-cyan-dim)', border: '1px solid var(--accent-cyan-border)',
              borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem', marginTop: '1rem',
              color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: 1.6,
            }}>
              <strong>Zero Public Model Training:</strong> Your radiographic scans, clinical notes, and patient records are never used to train, fine-tune, or calibrate public commercial foundation models without separate, explicit institutional review board (IRB) and written patient consent.
            </div>
          </section>

          {/* Section 4 */}
          <section>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.75rem', fontSize: '1.25rem' }}>
              <UserCheck size={20} color="var(--accent-cyan)" />
              4. Access Control and Role Isolation
            </h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.95rem' }}>
              Access to patient scans and diagnostic dossiers is strictly governed by cryptographic role-based authorization. Attending physicians have visibility into their verified patient roster only. Patients can access their own personal longitudinal history, symptom trackers, and patient-tailored educational summaries. Unauthorized cross-tenant data access is programmatically prohibited at the database API layer.
            </p>
          </section>

          {/* Section 5 */}
          <section>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.75rem', fontSize: '1.25rem' }}>
              <FileText size={20} color="var(--accent-cyan)" />
              5. Data Retention, Portability, and Deletion
            </h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.95rem' }}>
              Patients and healthcare institutions retain complete legal ownership of their clinical records. At any point, users may export complete imaging logs, consensus inference outputs, and symptom histories in standard JSON and PDF formats. Upon receiving an authorized deletion request, all corresponding scan binaries, volumetric masks, and database records will be permanently purged from active storage within thirty (30) business days.
            </p>
          </section>

          {/* Section 6 */}
          <section>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.75rem', fontSize: '1.25rem' }}>
              <Shield size={20} color="var(--accent-cyan)" />
              6. Regulatory Contact and Inquiries
            </h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.95rem' }}>
              For data protection questions, compliance audits, or patient right verification, please contact the NeuroScan AI Data Governance Officer through the institutional portal or via email at:
            </p>
            <p style={{ marginTop: '0.5rem', fontWeight: 600, color: 'var(--accent-cyan)', fontSize: '0.95rem' }}>
              privacy@neuroscan-ai.internal
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        padding: '2rem', borderTop: '1px solid var(--border-subtle)',
        textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginBottom: '0.75rem' }}>
          <Link to="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Home</Link>
          <Link to="/terms" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Terms &amp; Conditions</Link>
          <Link to="/login" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Sign In</Link>
          <Link to="/register" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Create Account</Link>
        </div>
        <p>NeuroScan AI &copy; {new Date().getFullYear()} &middot; Privacy and Data Protection Framework</p>
      </footer>
    </div>
  );
}
