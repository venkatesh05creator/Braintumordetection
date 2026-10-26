import React, { useState, useRef, useEffect } from 'react';
import {
  Brain, Send, ShieldAlert, Sparkles, User,
  ChevronLeft, ChevronRight, ChevronDown, BookOpenCheck
} from 'lucide-react';
import { chatAPI, patientsAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';

export default function AIAssistant() {
  const { user } = useAuthStore();
  const isDoc = user?.role === 'doctor';
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: (
        "**[Orchestrator Agent]** Welcome! I am your NeuroScan AI Assistant. " +
        "I am backed by specialized Diagnostic and Symptom Advisor agents to help you learn about " +
        "brain tumors, clinical symptoms, and scan analysis. " +
        (isDoc
          ? "Select a patient below to ground my answers in your recent consultation thread."
          : "I can also answer follow-up questions about what your doctor advised you in Clinical Chat.")
      )
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeAgent, setActiveAgent] = useState('Idle');
  const [showJump, setShowJump] = useState(false);
  const chatEndRef = useRef(null);
  const scrollRef = useRef(null);
  const msgListRef = useRef(null);

  // Doctor: pick which patient's consultation thread the AI should learn from
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [contextLoaded, setContextLoaded] = useState(0);
  const [contextError, setContextError] = useState('');

  // Patient: the AI automatically learns from their own doctor-patient thread
  const contextPatientId = isDoc ? selectedPatient?.id : user?.patient_id;
  const contextLabel = isDoc
    ? selectedPatient?.full_name
    : user?.full_name ? `your doctor` : null;

  useEffect(() => {
    if (isDoc) {
      patientsAPI.list()
        .then((res) => {
          setPatients(res.data);
          if (res.data.length > 0) setSelectedPatient(res.data[0]);
        })
        .catch(() => { });
    }
  }, [isDoc]);

  // Auto-scroll to the newest reply whenever the conversation changes
  useEffect(() => {
    const list = msgListRef.current;
    if (list) {
      list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
    }
    setShowJump(false);
  }, [messages, loading]);

  // Show the jump-to-bottom button when the user scrolls up away from the newest reply
  const handleScroll = () => {
    const list = msgListRef.current;
    if (!list) return;
    setShowJump(list.scrollHeight - list.scrollTop - list.clientHeight > 80);
  };

  const jumpToBottom = () => {
    const list = msgListRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || loading) return;

    const userMsg = { role: 'user', content: inputText };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setLoading(true);
    setActiveAgent('Orchestrator: Enforcing Scope');

    // Simulate multi-agent processing timeline
    const stages = [
      { agent: 'Diagnostic: Analyzing Terminology', delay: 1000 },
      { agent: 'Symptom Advisor: Evaluating Concerns', delay: 2200 },
      { agent: 'Orchestrator: Consolidating Response', delay: 3500 }
    ];

    stages.forEach((stage) => {
      setTimeout(() => {
        if (loading) setActiveAgent(stage.agent);
      }, stage.delay);
    });

    try {
      const payloadHistory = [...messages, userMsg].map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : m.content.props?.children || ''
      }));

      const res = await chatAPI.sendMessage(payloadHistory, contextPatientId);

      setContextError('');
      setContextLoaded(res.data.context_loaded || 0);
      setMessages((prev) => [...prev, { role: 'assistant', content: res.data.reply }]);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setContextError(typeof detail === 'string' ? detail : '');
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '⚠️ Failed to connect to the Multi-Agent engine. Please try again in a few moments.'
        }
      ]);
    } finally {
      setLoading(false);
      setActiveAgent('Idle');
    }
  };

  const loadSuggestedPrompt = (prompt) => {
    setInputText(prompt);
  };

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -250, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 250, behavior: 'smooth' });
    }
  };

  const patientPrompts = [
    "What did my doctor say in my latest consultation?",
    "What are the typical symptoms of a glioma?",
    "How does K-Means segmentation detect a tumor?",
    "Why do pituitary tumors affect vision?",
    "Explain the dural tail finding in meningioma",
    "What is the difference between a benign and malignant brain tumor?",
    "When should I contact my doctor regarding my symptoms?"
  ];

  const doctorPrompts = [
    "How should I explain the tumor burden trend to my patient?",
    "Summarize the guidance I recently gave in this consultation thread",
    "What follow-up questions should I ask about these symptoms?",
    "Explain the dural tail finding in meningioma",
    "What is the difference between Grade 2 and Grade 3 gliomas?",
    "When should a patient be escalated for immediate evaluation?"
  ];

  const suggestedPrompts = isDoc ? doctorPrompts : patientPrompts;

  return (
    <div className="animate-fade-in" style={{ height: 'calc(100vh - 4rem)', display: 'flex', flexDirection: 'column' }}>
      {/* Glass Page Header */}
      <div style={{
        background: 'rgba(0,229,200,0.04)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(0,229,200,0.12)',
        borderRadius: 20, padding: '1.25rem 2rem', marginBottom: '1rem',
        boxShadow: '0 0 40px rgba(0,229,200,0.06), 4px 4px 20px rgba(0,0,0,0.5)',
        flexShrink: 0,
      }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Brain size={24} color="var(--accent-cyan)" />
          <span className="text-gradient-cyan">Clinical AI Assistant</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          {isDoc
            ? 'NeuroBot AI — Secure multi-agent console for case analysis and patient-guidance support.'
            : 'NeuroBot AI — Secure multi-agent console for brain tumor query support.'}
        </p>

        {/* Context picker / status bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
          marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)'
        }}>
          <BookOpenCheck size={15} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
          {isDoc ? (
            <>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>AI context patient:</span>
              <select
                className="form-input"
                value={selectedPatient?.id || ''}
                onChange={(e) => {
                  const p = patients.find(x => x.id === Number(e.target.value));
                  setSelectedPatient(p || null);
                  setContextLoaded(0);
                }}
                style={{ width: 'auto', minWidth: 200, padding: '6px 10px', fontSize: '0.8rem', borderRadius: 8 }}
              >
                {patients.length === 0 && <option value="">No patients assigned</option>}
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
              <span style={{ fontSize: '0.75rem', color: contextLoaded > 0 ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                {contextLoaded > 0
                  ? `✓ AI is aware of your ${contextLoaded}-message thread with ${selectedPatient?.full_name}`
                  : 'AI will learn from the selected consultation thread'}
              </span>
            </>
          ) : (
            <span style={{ fontSize: '0.78rem', color: contextLoaded > 0 ? 'var(--accent-green)' : 'var(--text-muted)' }}>
              {contextLoaded > 0
                ? `✓ AI is aware of your recent ${contextLoaded}-message consultation — ask what your doctor advised`
                : 'AI learns from your doctor\u2019s replies in Clinical Chat to answer follow-ups'}
            </span>
          )}
          {contextError && (
            <span style={{ fontSize: '0.75rem', color: 'var(--accent-red)' }}>{contextError}</span>
          )}
        </div>
      </div>

      {/* Main Grid Wrapper — Glass Card */}
      <div style={{
        flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 280px', overflow: 'hidden',
        background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(30px)',
        border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20,
        boxShadow: '8px 8px 24px rgba(0,0,0,0.6), -4px -4px 16px rgba(255,255,255,0.04)',
      }}>

        {/* Chat Area (Left Column) */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, padding: '1.25rem', borderRight: '1px solid rgba(255,255,255,0.05)', minWidth: 0, background: 'var(--overlay-strong)' }}>

          {/* Messages List */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <div
            ref={msgListRef}
            onScroll={handleScroll}
            style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '0.5rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            {messages.map((msg, i) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: 12,
                    flexDirection: isUser ? 'row-reverse' : 'row',
                    alignItems: 'flex-start',
                  }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'var(--accent-cyan-dim)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent-cyan)',
                    border: '1px solid var(--border-accent)',
                    flexShrink: 0
                  }}>
                    {isUser ? <User size={16} /> : <Brain size={16} />}
                  </div>

                  {/* User: cyan-tinted glass / AI: dark glass */}
                  <div style={{
                    maxWidth: '75%',
                    padding: '0.75rem 1rem',
                    borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                    background: isUser ? 'rgba(0,229,200,0.08)' : 'rgba(255,255,255,0.04)',
                    backdropFilter: 'blur(10px)',
                    border: `1px solid ${isUser ? 'rgba(0,229,200,0.22)' : 'rgba(255,255,255,0.06)'}`,
                    boxShadow: isUser ? '3px 3px 10px rgba(0,0,0,0.5)' : '3px 3px 10px rgba(0,0,0,0.5), -1px -1px 5px rgba(255,255,255,0.03)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem', lineHeight: '1.6', whiteSpace: 'pre-wrap',
                  }}>
                    {msg.content}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--accent-cyan-dim)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-cyan)',
                  border: '1px solid var(--border-accent)'
                }}>
                  <Brain size={16} className="animate-pulse" />
                </div>
                <div style={{
                  padding: '0.75rem 1rem',
                  borderRadius: 16,
                  background: 'var(--bubble-dark)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem'
                }}>
                  <div className="loading-dots" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span className="dot animate-pulse" style={{ color: 'var(--accent-cyan)' }}>●</span>
                    <span className="dot animate-pulse" style={{ animationDelay: '0.2s', color: 'var(--accent-cyan)' }}>●</span>
                    <span className="dot animate-pulse" style={{ animationDelay: '0.4s', color: 'var(--accent-cyan)' }}>●</span>
                    <span style={{ marginLeft: 8, fontSize: '0.75rem', fontStyle: 'italic', color: 'var(--text-muted)' }}>({activeAgent})</span>
                  </div>
                </div>
              </div>
            )}            <div ref={chatEndRef} />
          </div>

          {/* Jump to newest reply — appears when scrolled up */}
          {showJump && (
            <button
              type="button"
              className="chat-jump-bottom"
              onClick={jumpToBottom}
              aria-label="Scroll to newest reply"
              title="Jump to newest reply"
            >
              <ChevronDown size={18} />
            </button>
          )}
          </div>

              {/* Prompt slider strip — Glass neumorphic */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginBottom: '0.75rem', width: '100%', background: 'var(--neu-base)', boxShadow: 'var(--neu-inset)', padding: '6px 8px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
            <button
              type="button"
              onClick={scrollLeft}
              style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', padding: '0 4px', display: 'flex', alignItems: 'center' }}
              title="Scroll Left"
            >
              <ChevronLeft size={20} />
            </button>

            <div
              ref={scrollRef}
              className="no-scrollbar"
              style={{
                display: 'flex',
                gap: '0.5rem',
                overflowX: 'auto',
                scrollBehavior: 'smooth',
                width: '100%',
                padding: '2px 0',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
              }}
            >
              {suggestedPrompts.map((prompt, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => loadSuggestedPrompt(prompt)}
                  style={{
                    flexShrink: 0, whiteSpace: 'nowrap', fontSize: '0.72rem',
                    background: 'rgba(0,229,200,0.05)',
                    border: '1px solid rgba(0,229,200,0.14)',
                    borderRadius: 999, padding: '5px 14px',
                    color: 'var(--text-muted)', cursor: 'pointer',
                    transition: 'all 0.2s', fontFamily: 'inherit',
                    maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(0,229,200,0.35)'; e.currentTarget.style.color = 'var(--accent-cyan)'; e.currentTarget.style.boxShadow = '0 0 10px rgba(0,229,200,0.12)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(0,229,200,0.14)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  {prompt}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={scrollRight}
              style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', padding: '0 4px', display: 'flex', alignItems: 'center' }}
              title="Scroll Right"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Input Form — Glassmorphic */}
          <form onSubmit={handleSend} style={{ display: 'flex', gap: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
            <input
              type="text"
              className="form-input"
              placeholder={isDoc ? "Ask about this patient's case or your guidance..." : "Ask about brain tumors, symptoms, or what your doctor advised..."}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={loading}
              style={{ borderRadius: 12 }}
            />
            <button type="submit" className="btn btn-primary" style={{ borderRadius: 12, width: 44, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} disabled={loading}>
              <Send size={15} />
            </button>
          </form>
        </div>

        {/* Side Console (Right Column) — Glassmorphic */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem', overflowY: 'auto', minHeight: 0, background: 'var(--overlay-soft)', backdropFilter: 'blur(20px)' }}>
          {/* Agent Info Panel */}
          <div>
            <h3 style={{ fontSize: '0.82rem', fontWeight: 700, margin: '0 0 1.25rem 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              <Sparkles size={14} style={{ color: 'var(--accent-cyan)' }} />
              Multi-Agent Engine
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: loading && activeAgent.includes('Orchestrator') ? 'var(--accent-cyan)' : 'var(--border-subtle)',
                  boxShadow: loading && activeAgent.includes('Orchestrator') ? '0 0 8px var(--accent-cyan)' : 'none'
                }} />
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>Orchestrator Agent</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Filters topics & compiles output</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: loading && activeAgent.includes('Diagnostic') ? 'var(--accent-cyan)' : 'var(--border-subtle)',
                  boxShadow: loading && activeAgent.includes('Diagnostic') ? '0 0 8px var(--accent-cyan)' : 'none'
                }} />
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>Diagnostic Agent</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Consults tumor staging & types</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: loading && activeAgent.includes('Symptom') ? 'var(--accent-cyan)' : 'var(--border-subtle)',
                  boxShadow: loading && activeAgent.includes('Symptom') ? '0 0 8px var(--accent-cyan)' : 'none'
                }} />
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>Symptom Advisor</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Analyzes clinical symptoms</div>
                </div>
              </div>
            </div>
          </div>

          {/* Context learning panel */}
          <div style={{
            padding: '0.75rem',
            borderRadius: 8,
            background: 'rgba(0,229,200,0.05)',
            border: '1px solid rgba(0,229,200,0.15)',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
          }}>
            <BookOpenCheck size={14} style={{ color: 'var(--accent-cyan)', flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
              <strong style={{ color: 'var(--accent-cyan)' }}>Learns from your chat:</strong>{' '}
              {isDoc
                ? 'Pick a patient above and the AI reads your consultation thread to answer case questions with your own guidance in mind.'
                : 'When your doctor replies in Clinical Chat, the AI can answer follow-ups like "what did my doctor mean?" using that reply.'}
            </div>
          </div>

          {/* Medical disclaimer */}
          <div style={{
            padding: '0.75rem',
            borderRadius: 8,
            background: 'var(--accent-red-dim)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
            marginTop: 'auto'
          }}>
            <ShieldAlert size={14} style={{ color: 'var(--accent-red)', flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: '0.7rem', color: '#fca5a5', lineHeight: '1.4' }}>
              <strong>Clinical Guard:</strong> Consultation is educational. Seek professional guidance for any diagnostic decisions.
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
