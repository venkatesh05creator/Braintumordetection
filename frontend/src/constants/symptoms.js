// Shared symptom definitions — the same 7 tracked symptoms with display labels
// and colors are used by the patient tracker form, the radar chart, and the
// doctor dashboard's symptom-detail view. One source so the UI stays in sync.

export const SYMPTOMS = [
  { key: 'headache', label: 'Headache', color: '#ef4444' },
  { key: 'seizures', label: 'Seizures', color: '#f59e0b' },
  { key: 'vision_changes', label: 'Vision Changes', color: '#7c3aed' },
  { key: 'nausea', label: 'Nausea', color: '#00d49f' },
  { key: 'motor_weakness', label: 'Motor Weakness', color: '#ec4899' },
  { key: 'cognitive_changes', label: 'Cognitive Changes', color: '#3b82f6' },
  { key: 'fatigue', label: 'Fatigue', color: '#f97316' },
];

// Per-symptom 0-10 severity band labels (same wording as the patient tracker)
export const getSymptomLevelText = (value) => {
  if (value === 0) return 'None';
  if (value <= 3) return 'Mild';
  if (value <= 6) return 'Moderate';
  if (value <= 9) return 'Severe';
  return 'Extreme';
};
