import { useEffect, useRef } from 'react';
import { scoreColor } from '../lib/utils';

export default function ScoreRing({ score, size = 88 }) {
  const fillRef = useRef(null);
  const r = 36;
  const c = 2 * Math.PI * r;
  const color = scoreColor(score);
  const offset = c - (score / 100) * c;

  useEffect(() => {
    const t = setTimeout(() => {
      if (fillRef.current) fillRef.current.style.strokeDashoffset = String(offset);
    }, 200);
    return () => clearTimeout(t);
  }, [offset]);

  return (
    <svg className="score-ring-svg" width={size} height={size} viewBox="0 0 88 88">
      <circle className="score-ring-bg" cx="44" cy="44" r={r} />
      <circle
        ref={fillRef}
        className="score-ring-fill"
        cx="44"
        cy="44"
        r={r}
        stroke={color}
        strokeDasharray={c}
        strokeDashoffset={c}
      />
    </svg>
  );
}
