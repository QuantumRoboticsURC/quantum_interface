import React from "react";

export function bearingToCardinal(bearing: number): string {
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(bearing / 45) % 8];
}

const CompassRose: React.FC<{ yaw: number; frozen: boolean }> = ({ yaw, frozen }) => {
  const rotation = yaw - 90;
  const bearing  = ((90 - yaw) % 360 + 360) % 360;
  const cardinal = bearingToCardinal(bearing);
  const ticks    = Array.from({ length: 12 }, (_, i) => i * 30);
  const pt = (deg: number, r: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: 50 + r * Math.sin(rad), y: 50 - r * Math.cos(rad) };
  };
  const cardinals = [
    { label: "N", deg: 0,   color: "#fbbf24" },
    { label: "E", deg: 90,  color: "#e5e7eb" },
    { label: "S", deg: 180, color: "#e5e7eb" },
    { label: "W", deg: 270, color: "#e5e7eb" },
  ];
  return (
    <div className="absolute top-3 right-3 z-20 pointer-events-none select-none">
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 100 100" className="absolute inset-0"
          style={{ transform: `rotate(${rotation}deg)`, transition: frozen ? "none" : "transform 0.12s linear" }}>
          {ticks.map(deg => {
            const major = deg % 90 === 0;
            const a = pt(deg, 40), b = pt(deg, major ? 33 : 36);
            return <line key={deg} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={major ? "#9ca3af" : "#4b5563"} strokeWidth={major ? 1.4 : 0.8} />;
          })}
          {cardinals.map(c => {
            const p = pt(c.deg, 24);
            return <text key={c.label} x={p.x} y={p.y} fill={c.color} fontSize="11"
              fontWeight="700" textAnchor="middle" dominantBaseline="central">{c.label}</text>;
          })}
        </svg>
        <svg viewBox="0 0 100 100" className="absolute inset-0">
          <circle cx="50" cy="50" r="46" fill="rgba(17,24,39,0.55)" />
          <circle cx="50" cy="50" r="46" fill="none" stroke="#374151" strokeWidth="1.5" />
          <polygon points="50,6 46,17 54,17" fill="#f59e0b" />
          <circle cx="50" cy="50" r="2" fill="#6b7280" />
          <text x="50" y="62" fill="#f3f4f6" fontSize="13" fontWeight="700" textAnchor="middle">
            {Math.round(bearing)}°
          </text>
          <text x="50" y="72" fill="#9ca3af" fontSize="7" letterSpacing="1" textAnchor="middle">
            {cardinal}
          </text>
        </svg>
      </div>
    </div>
  );
};

export default CompassRose;
