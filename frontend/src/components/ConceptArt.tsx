import { useId } from 'react';

const regressionPoints = [
  [42, 149], [74, 130], [103, 139], [132, 101], [163, 113], [195, 82], [226, 88], [259, 49], [292, 62], [322, 29],
];
const overfitPoints = [
  [38, 134], [76, 88], [111, 117], [148, 52], [185, 91], [222, 42], [260, 70], [303, 29],
];

export function ConceptArt({ type, className = '' }: { type: string; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <div className={`concept-art concept-art--${type} ${className}`} aria-hidden="true">
      <svg viewBox="0 0 360 190" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={`line-${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="currentColor" stopOpacity=".3" />
            <stop offset="1" stopColor="var(--art-accent, #dff18f)" />
          </linearGradient>
          <radialGradient id={`glow-${id}`}>
            <stop offset="0" stopColor="var(--art-accent, #dff18f)" stopOpacity=".3" />
            <stop offset="1" stopColor="var(--art-accent, #dff18f)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="282" cy="49" r="90" fill={`url(#glow-${id})`} />
        <g className="art-grid">
          {[40, 80, 120, 160].map((y) => <path key={`y${y}`} d={`M22 ${y}H340`} />)}
          {[60, 120, 180, 240, 300].map((x) => <path key={`x${x}`} d={`M${x} 18V166`} />)}
        </g>
        <path className="art-axis" d="M22 166H340M22 18V166" />
        {type === 'linear-regression' && (
          <>
            <path className="art-line art-line--main" d="M28 159L334 18" stroke={`url(#line-${id})`} />
            <g className="art-points">
              {regressionPoints.map(([x, y], index) => <circle key={index} cx={x} cy={y} r="4.5" style={{ animationDelay: `${index * 60}ms` }} />)}
            </g>
            <path className="art-residual" d="M132 101V109M195 82V91M259 49V58M292 62V35" />
            <g className="art-formula"><rect x="230" y="127" width="103" height="29" rx="7" /><text x="243" y="147">ŷ = wx + b</text></g>
          </>
        )}
        {type === 'overfitting' && (
          <>
            <path className="art-line art-line--ghost" d="M27 146C115 121 232 76 334 35" />
            <path className="art-line art-line--main" d="M28 139C54 142 57 76 82 87S100 130 120 111 132 40 156 55 171 105 192 84 210 28 231 47 246 83 267 64 286 17 314 34" stroke={`url(#line-${id})`} />
            <g className="art-points">
              {overfitPoints.map(([x, y], index) => <circle key={index} cx={x} cy={y} r="4.5" style={{ animationDelay: `${index * 60}ms` }} />)}
            </g>
            <g className="art-formula"><rect x="35" y="24" width="105" height="28" rx="7" /><text x="47" y="43">复杂 ≠ 泛化</text></g>
          </>
        )}
        {type === 'regularization' && (
          <>
            <path className="art-line art-line--ghost" d="M28 139C54 142 57 76 82 87S100 130 120 111 132 40 156 55 171 105 192 84 210 28 231 47 246 83 267 64 286 17 314 34" />
            <path className="art-line art-line--main" d="M28 146C115 121 232 76 334 35" stroke={`url(#line-${id})`} />
            <g className="art-points art-points--sparse">
              {overfitPoints.map(([x, y], index) => <circle key={index} cx={x} cy={y} r="4" />)}
            </g>
            <g className="art-contours"><ellipse cx="264" cy="103" rx="52" ry="32" /><ellipse cx="264" cy="103" rx="34" ry="20" /><ellipse cx="264" cy="103" rx="15" ry="9" /></g>
            <g className="art-formula"><rect x="35" y="24" width="104" height="28" rx="7" /><text x="47" y="43">Loss + λ‖w‖²</text></g>
          </>
        )}
      </svg>
      <div className="art-caption"><span>模型空间</span><span>FIG. {type === 'linear-regression' ? '01' : type === 'overfitting' ? '02' : '03'}</span></div>
    </div>
  );
}
