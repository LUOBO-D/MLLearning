export type ConfidenceValue = 1 | 2 | 3 | 4 | 5;

export const confidenceLabels = ['很不确定', '不太确定', '有些把握', '比较有把握', '非常确定'] as const;

export function ConfidenceScale({
  value,
  onChange,
  disabled = false,
}: {
  value: ConfidenceValue;
  onChange: (value: ConfidenceValue) => void;
  disabled?: boolean;
}) {
  return (
    <div className="confidence-block">
      <div className="confidence-heading">
        <span>你对这个判断有多大把握？</span>
        <strong>{confidenceLabels[value - 1]}</strong>
      </div>
      <div className="confidence-options" role="group" aria-label="置信度，1表示很不确定，5表示非常确定">
        {confidenceLabels.map((label, index) => {
          const choice = (index + 1) as ConfidenceValue;
          return (
            <button
              key={label}
              type="button"
              className={value === choice ? 'is-active' : ''}
              aria-label={`${choice}：${label}`}
              aria-pressed={value === choice}
              disabled={disabled}
              onClick={() => onChange(choice)}
            >
              <i aria-hidden="true" />
              <span>{choice}</span>
              <small>{label}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
