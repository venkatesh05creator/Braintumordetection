import React, { useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { Upload, Brain, CheckCircle, AlertTriangle, Zap, Shield, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { scansAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import EnsembleResultPanel from '../../components/EnsembleResultPanel';

export default function ScanUpload() {
  const { user, isPatient } = useAuthStore();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);

  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState(null);
  const videoRef = React.useRef(null);

  const startCamera = async () => {
    try {
      setError(null);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError('Camera access is not supported by your browser or requires a secure connection (HTTPS).');
        return;
      }

      let mediaStream;
      try {
        // Try back-facing camera first (ideal for mobile devices scanning a physical printout)
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1024 }, height: { ideal: 1024 } }
        });
      } catch (firstErr) {
        // Fall back to any available webcam (e.g. desktop/laptop front cameras)
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true
        });
      }

      setStream(mediaStream);
      setShowCamera(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      }, 100);
    } catch (err) {
      console.error('Camera access error:', err);
      setError('Could not access device camera. Please check permissions or select a file instead.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    setStream(null);
    setShowCamera(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], 'mri_camera_capture.jpg', { type: 'image/jpeg' });
      stopCamera();
      onDrop([file]);
    }, 'image/jpeg', 0.95);
  };

  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(file);

    setUploading(true);
    setResult(null);
    setError(null);
    setProgress(10);

    // Simulate progress while waiting for AI
    const progressInterval = setInterval(() => {
      setProgress((p) => Math.min(p + 8, 85));
    }, 1500);

    try {
      const patientId = user?.patient_id || 1;
      const res = await scansAPI.upload(patientId, file);
      clearInterval(progressInterval);
      setProgress(100);
      setTimeout(() => {
        setResult(res.data);
        setUploading(false);
      }, 500);
    } catch (err) {
      clearInterval(progressInterval);
      setError(err.response?.data?.detail || 'Analysis failed. Please try again.');
      setUploading(false);
      setProgress(0);
    }
  }, [user]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    disabled: uploading,
  });

  const steps = [
    { icon: <Upload size={16} />, label: 'Upload MRI', done: uploading || !!result },
    { icon: <Brain size={16} />, label: 'AI Ensemble Analysis', done: progress > 50 },
    { icon: <Eye size={16} />, label: 'Segmentation + Grad-CAM', done: progress > 75 },
    { icon: <Shield size={16} />, label: 'Clinical Report', done: !!result },
  ];

  return (
    <div className="animate-fade-in">
      {/* Page Header — Glass Banner */}
      <div style={{
        background: 'rgba(0,229,200,0.04)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(0,229,200,0.12)',
        borderRadius: 20,
        padding: '1.5rem 2rem',
        marginBottom: '2rem',
        boxShadow: '0 0 40px rgba(0,229,200,0.06), 4px 4px 20px rgba(0,0,0,0.5), -2px -2px 10px rgba(255,255,255,0.04)',
      }}>
        <h1 style={{ fontSize: '1.75rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Brain size={28} color="var(--accent-cyan)" />
          <span className="text-gradient-cyan">MRI Scan Analysis Portal</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Upload your brain MRI slice or snap a photo for multi-AI ensemble consensus diagnostics.
        </p>
      </div>

      {!result && (
        <div style={{
          maxWidth: 700, margin: '0 auto',
          background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(30px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 24, padding: '2rem',
          boxShadow: '8px 8px 24px rgba(0,0,0,0.6), -4px -4px 16px rgba(255,255,255,0.04)',
          position: 'relative', overflow: 'hidden',
        }}>
          {showCamera ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                position: 'relative',
                borderRadius: 12,
                overflow: 'hidden',
                border: '2px solid var(--accent-cyan)',
                width: '100%',
                maxHeight: 400,
                background: '#090c13',
                boxShadow: '0 0 20px var(--accent-cyan-glow)'
              }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', width: '100%' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={capturePhoto}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--accent-cyan)', color: '#090c13' }}
                >
                  <CheckCircle size={18} />
                  Capture Scan
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={stopCamera}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Glassmorphic Dropzone */}
              <div
                {...getRootProps()}
                style={{
                  opacity: uploading ? 0.7 : 1,
                  border: isDragActive ? '2px dashed rgba(0,229,200,0.60)' : '2px dashed rgba(255,255,255,0.12)',
                  background: isDragActive ? 'rgba(0,229,200,0.07)' : 'var(--overlay-soft)',
                  boxShadow: isDragActive ? '0 0 40px rgba(0,229,200,0.15), inset 4px 4px 12px rgba(0,0,0,0.5)' : 'inset 4px 4px 12px rgba(0,0,0,0.5), inset -2px -2px 8px rgba(255,255,255,0.03)',
                  padding: '3rem 2rem',
                  borderRadius: 18,
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <input {...getInputProps()} />
                {preview ? (
                  <img
                    src={preview}
                    alt="MRI Preview"
                    style={{
                      maxHeight: 200,
                      borderRadius: 12,
                      marginBottom: '1rem',
                      border: '2px solid var(--accent-cyan)',
                      boxShadow: '0 0 15px var(--accent-cyan-glow)'
                    }}
                  />
                ) : (
                  <div style={{ fontSize: '3rem', marginBottom: '1rem', animation: uploading ? 'pulse 1.5s infinite' : 'none' }}>🧬</div>
                )}
                <h3 style={{ color: 'var(--text-primary)', marginBottom: 8, fontSize: '1.1rem' }}>
                  {isDragActive ? 'Drop MRI scan here...' : 'Drop MRI scan or click to browse'}
                </h3>
                <p className="text-secondary text-sm" style={{ color: 'var(--text-secondary)' }}>
                  JPEG, PNG, WebP • Max 10MB • Brain MRI scans only
                </p>
              </div>

              {!uploading && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={startCamera}
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    📸 Use Device Camera
                  </button>
                </div>
              )}
            </>
          )}

          {/* Upload Progress — Glass Progress Panel */}
          {uploading && (
            <div style={{ marginTop: '1.5rem', background: 'rgba(0,229,200,0.04)', border: '1px solid rgba(0,229,200,0.12)', borderRadius: 16, padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Analyzing with Multi-AI Ensemble...</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>{progress}%</span>
              </div>
              {/* Neumorphic progress track */}
              <div style={{ background: 'var(--neu-base)', height: 8, borderRadius: 999, boxShadow: 'var(--neu-inset)', overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', borderRadius: 999, background: 'var(--gradient-cyan)', boxShadow: '0 0 12px rgba(0,229,200,0.50)', transition: 'width 0.5s ease' }} />
              </div>

              {/* Step indicators — Glassmorphic Pills */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                {steps.map((step, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '0.4rem 0.85rem',
                      borderRadius: 999,
                      fontSize: '0.72rem', fontWeight: 600,
                      background: step.done ? 'rgba(0,229,200,0.10)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${step.done ? 'rgba(0,229,200,0.30)' : 'rgba(255,255,255,0.08)'}`,
                      color: step.done ? 'var(--accent-cyan)' : 'var(--text-muted)',
                      boxShadow: step.done ? '0 0 12px rgba(0,229,200,0.15)' : 'none',
                      transition: 'all 0.3s ease',
                    }}
                  >
                    {step.done ? <CheckCircle size={11} /> : step.icon}
                    {step.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="alert alert-error" style={{ marginTop: '1.5rem' }}>
              <AlertTriangle size={16} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
              <div>
                <strong>Analysis Failed</strong>
                <p style={{ fontSize: '0.82rem', marginTop: 3 }}>{error}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {result && (
        <EnsembleResultPanel
          result={result}
          originalImage={preview}
          onReset={() => { setResult(null); setPreview(null); setProgress(0); }}
        />
      )}
    </div>
  );
}
