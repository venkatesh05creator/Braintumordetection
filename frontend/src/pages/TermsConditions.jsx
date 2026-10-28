import React from 'react';
import { Link } from 'react-router-dom';
import { Scale, AlertTriangle, FileCheck, ShieldAlert, CheckCircle2, UserCheck, ArrowLeft, Brain } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';

export default function TermsConditions() {
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
            <Scale size={14} />
            Institutional Usage Terms
          </div>
          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 2.75rem)', fontFamily: 'Space Grotesk', marginBottom: '0.75rem' }}>
            Terms and Conditions
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Last revised: October 20, 2026 &middot; Legally binding terms of use for clinical and patient portals
          </p>
        </div>

        <div className="glass-panel" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
          {/* Section 1 */}
          <section>
            <div style={{
              background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: 'var(--radius-md)', padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
              display: 'flex', gap: 14, alignItems: 'flex-start',
            }}>
              <ShieldAlert size={22} color="var(--accent-red)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong style={{ color: 'var(--accent-red)', fontSize: '0.95rem' }}>Critical Medical Notice:</strong>
                <p style={{ color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: 1.6, marginTop: 4 }}>
                  NeuroScan AI is not an autonomous diagnostic device. All machine learning outputs, segmentation masks, confidence scores, and report summaries are assistive findings that must be reviewed, verified, and signed off by a qualified, board-certified neuroradiologist or licensed physician.
                </p>
              </div>
            </div>

            <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.75rem', fontSize: '1.25rem' }}>
              <FileCheck size={20} color="var(--accent-cyan)" />
              1. Acceptance of Terms
            </h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.95rem' }}>
              By accessing, browsing, registering for, or using the NeuroScan AI platform, you confirm that you have read, understood, and agreed to be bound by these Terms and Conditions. If you do not agree to these terms, you must discontinue platform use immediately.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.75rem', fontSize: '1.25rem' }}>
              <UserCheck size={20} color="var(--accent-cyan)" />
              2. Eligibility and Professional Qualifications
            </h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.95rem', marginBottom: '0.75rem' }}>
              Access to specific portal tiers is restricted as follows:
            </p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.95rem', paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li>
                <strong style={{ color: 'var(--text-primary)' }}>Doctor and Clinician Portals:</strong> Authorized exclusively for licensed medical doctors, neuro-oncologists, diagnostic radiologists, and accredited neurosurgical fellows. Clinicians warrant that all patient data handled under their supervision is in compliance with local medical confidentiality laws.
              </li>
              <li>
                <strong style={{ color: 'var(--text-primary)' }}>Patient and Caregiver Portals:</strong> Patients may access their personal scan dossier, educational reports, and symptom tracker. Patients acknowledge that informational summaries generated by AI assistants cannot substitute for direct consultation with their treating physician.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.75rem', fontSize: '1.25rem' }}>
              <AlertTriangle size={20} color="var(--accent-amber)" />
              3. Prohibition on Acute Emergency Usage
            </h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.95rem' }}>
              NeuroScan AI is not intended or calibrated for acute critical-care emergencies, rapid trauma evaluation, or life-support management. In the event of acute neurological deterioration (such as sudden paralysis, onset of seizures, severe acute headache, or altered consciousness), users must immediately call emergency medical services or proceed to the nearest emergency medical facility.
            </p>
          </section>

          {/* Section 4 */}
          <section>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.75rem', fontSize: '1.25rem' }}>
              <CheckCircle2 size={20} color="var(--accent-cyan)" />
              4. Permitted and Prohibited Conduct
            </h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.95rem', marginBottom: '0.75rem' }}>
              When utilizing the platform, users agree that they will not:
            </p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.95rem', paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li>Upload malicious code, automated web scrapers, or corrupted image binaries intended to compromise platform availability.</li>
              <li>Attempt to reverse-engineer, decompile, or extract proprietary ensemble calibration weights and model architecture.</li>
              <li>Share user credentials, session tokens, or patient records with unauthorized third parties.</li>
              <li>Misrepresent clinical credentials or falsify physician validation verdicts.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.75rem', fontSize: '1.25rem' }}>
              <Scale size={20} color="var(--accent-cyan)" />
              5. Intellectual Property and Clinical Reports
            </h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.95rem' }}>
              All software interfaces, consensus algorithms, visual styling, and proprietary systems are the exclusive intellectual property of NeuroScan AI. Patients and healthcare providers retain complete ownership of their uploaded primary imaging datasets and generated clinical PDF reports.
            </p>
          </section>

          {/* Section 6 */}
          <section>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.75rem', fontSize: '1.25rem' }}>
              <ShieldAlert size={20} color="var(--accent-cyan)" />
              6. Disclaimer of Warranties and Limitation of Liability
            </h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.95rem' }}>
              To the fullest extent permitted by applicable law, NeuroScan AI is provided on an "as is" and "as available" basis without warranties of any kind, whether express or implied. NeuroScan AI disclaims all liability for clinical treatment decisions made solely on the basis of machine learning estimations without independent radiologist review.
            </p>
          </section>

          {/* Section 7 */}
          <section>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.75rem', fontSize: '1.25rem' }}>
              <FileCheck size={20} color="var(--accent-cyan)" />
              7. Governing Law and Amendments
            </h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.95rem' }}>
              These Terms shall be governed by and construed in accordance with applicable healthcare information technology laws and digital health regulations. We reserve the right to modify these terms as clinical standards and regulatory frameworks evolve. Notice of significant revisions will be posted directly within the platform.
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
          <Link to="/privacy" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Privacy Policy</Link>
          <Link to="/login" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Sign In</Link>
          <Link to="/register" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Create Account</Link>
        </div>
        <p>NeuroScan AI &copy; {new Date().getFullYear()} &middot; Clinical Decision Support &middot; All Rights Reserved</p>
      </footer>
    </div>
  );
}
