import { useState, type ReactNode } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import type { ProgressEventResult } from '../../types';

export interface ExperimentProps {
  onComplete: (minutes: number, metadata: Record<string, unknown>) => Promise<ProgressEventResult>;
  isSaving?: boolean;
}

export function LabFrame({
  index,
  title,
  hint,
  children,
  legend,
  action,
  className = '',
}: {
  action?: ReactNode;
  index: string;
  title: string;
  hint?: ReactNode;
  children: ReactNode;
  legend?: ReactNode;
  className?: string;
}) {
  return (
    <figure className={`xp-figure ${className}`.trim()}>
      <header className="xp-figure-head">
        <span className="xp-figure-index">{index}</span>
        <strong>{title}</strong>
        {hint && <span className="xp-figure-hint">{hint}</span>}
      </header>
      {children}
      {(legend || action) && (
        <figcaption className="xp-legend">
          {legend}
          {action && <span className="xp-legend-action">{action}</span>}
        </figcaption>
      )}
    </figure>
  );
}

export function LegendItem({ kind, children }: { kind: string; children: ReactNode }) {
  return <span className="xp-legend-item"><i className={`xp-key xp-key--${kind}`} aria-hidden="true" />{children}</span>;
}

export function Readout({
  label,
  value,
  detail,
  tone = 'default',
  size = 'large',
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  tone?: 'default' | 'lime' | 'violet' | 'warning';
  size?: 'large' | 'small';
}) {
  return (
    <div className={`xp-readout xp-readout--${size}`} data-tone={tone}>
      <span>{label}</span>
      <strong aria-live="polite">{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

export function RangeField({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  marks = [],
  valueText,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  marks?: { value: number; label: string; tone?: 'warning' | 'lime' }[];
  valueText?: string;
}) {
  const percent = ((value - min) / (max - min)) * 100;
  return (
    <label className="xp-range">
      <span className="xp-range-head"><span>{label}</span><output>{display}</output></span>
      <span className="xp-range-track" style={{ ['--fill' as string]: `${Math.max(0, Math.min(100, percent))}%` }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-valuetext={valueText || display}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </span>
      {marks.length > 0 && (
        <span className="xp-range-marks" aria-hidden="true">
          {marks.map((mark) => (
            <span key={mark.label} data-tone={mark.tone} style={{ left: `${((mark.value - min) / (max - min)) * 100}%` }}>{mark.label}</span>
          ))}
        </span>
      )}
    </label>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="xp-segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={value === option.value ? 'is-active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Insight({ tone = 'default', title, children }: { tone?: 'default' | 'warning' | 'success'; title: string; children: ReactNode }) {
  return (
    <div className="xp-insight" data-tone={tone} aria-live="polite">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

function recordMessage(recorded: boolean) {
  return recorded
    ? { title: '已写入学习日志', detail: '参数与误差已随事件保存，可在日志中回看。', button: '已记录' }
    : { title: '今天已记录过本概念实验', detail: '本次新参数没有再次写入；日志保留今天首次记录的结果。', button: '今日已记录' };
}

export function RecordExperiment({ values, onComplete, isSaving }: ExperimentProps & { values: Record<string, unknown> }) {
  const [recorded, setRecorded] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const record = async () => {
    setFailed(false);
    try {
      const result = await onComplete(3, values);
      setRecorded(result.recorded);
    } catch {
      setFailed(true);
    }
  };
  const message = recorded === null ? null : recordMessage(recorded);
  return (
    <div className="xp-record">
      <div>
        <strong>{message?.title || '把这次观察留下来'}</strong>
        <p>{message?.detail || '保存当前参数与误差，记录 3 分钟实验时间；不改变掌握状态。'}</p>
        {failed && <p className="xp-record-error" role="alert">记录失败，请确认本地服务后重试。</p>}
      </div>
      <button
        type="button"
        className={`button ${recorded !== null ? 'button--completed' : 'button--secondary'}`}
        disabled={isSaving || recorded !== null}
        onClick={record}
      >
        {message ? <><Check size={16} />{message.button}</> : isSaving ? '正在保存…' : <>记录本次实验<ArrowRight size={16} /></>}
      </button>
    </div>
  );
}

export const fmt = (value: number, digits = 3) => {
  if (!Number.isFinite(value)) return '∞';
  if (Math.abs(value) < 0.5 * 10 ** -digits) return (0).toFixed(digits);
  if (Math.abs(value) >= 1000) return value.toExponential(1);
  return value.toFixed(digits);
};
