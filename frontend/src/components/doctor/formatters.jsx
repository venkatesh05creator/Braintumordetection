// Formatting helpers shared by the doctor dashboard sub-components.

export const burdenOf = (scan) => (scan?.tumor_burden_pct ?? null);
export const fmtBurden = (v) => (v == null ? '—' : `${Number(v).toFixed(1)}%`);
export const fmtPct = (v) => (v == null ? '—' : `${(Number(v) * 100).toFixed(1)}%`);
export const fmtSigned = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}`);
export const fmtVol = (v) => (v == null ? '—' : `${Number(v).toFixed(2)} cm³`);

export const riskBadge = (level) => {
  const map = {
    critical: ['badge-critical', 'CRITICAL'],
    high: ['badge-high', 'HIGH'],
    medium: ['badge-medium', 'MEDIUM'],
    low: ['badge-low', 'LOW'],
    unknown: ['badge-unknown', 'UNKNOWN'],
  };
  const [cls, label] = map[level] || map.unknown;
  return <span className={`badge ${cls}`} style={{ fontSize: '0.62rem', padding: '1px 7px' }}>{label}</span>;
};
