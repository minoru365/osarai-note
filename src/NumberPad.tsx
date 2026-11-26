// In-app numeric keypad (docs/units-plan.md 3.1). The device keyboard is never
// used, matching how kanji reading answers go through the in-app kana table.

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  submitLabel?: string;
  /** False for whole-number answers such as "何km何m"; disables the point key. */
  allowDecimal?: boolean;
  /** Overrides when こたえる can be pressed, e.g. both boxes of a two-number answer. */
  canSubmit?: boolean;
};

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const MAX_LENGTH = 12;

export function appendKey(value: string, key: string): string {
  if (key === ".") {
    // One decimal point, and never as the first character.
    return value.includes(".") || value.length === 0 ? value : `${value}.`;
  }
  if (value.length >= MAX_LENGTH) return value;
  // Avoid leading zeros like "007", but keep "0." on its way to "0.5".
  if (value === "0") return key === "0" ? value : key;
  return `${value}${key}`;
}

export function NumberPad({ value, onChange, onSubmit, disabled = false, submitLabel = "こたえる", allowDecimal = true, canSubmit }: Props) {
  const press = (key: string) => onChange(appendKey(value, key));

  return (
    <div className="number-pad">
      <div className="number-pad-grid">
        {DIGITS.map((digit) => (
          <button key={digit} type="button" disabled={disabled} onClick={() => press(digit)}>
            {digit}
          </button>
        ))}
        <button type="button" disabled={disabled || !allowDecimal} aria-label={allowDecimal ? "小数点" : "小数点（この問題では使わない）"} onClick={() => press(".")}>.</button>
        <button type="button" disabled={disabled} onClick={() => press("0")}>0</button>
        <button
          type="button"
          className="number-pad-delete"
          disabled={disabled || value.length === 0}
          onClick={() => onChange(value.slice(0, -1))}
        >
          けす
        </button>
      </div>
      <button
        className="number-pad-submit"
        type="button"
        disabled={disabled || !(canSubmit ?? (value.length > 0 && !value.endsWith(".")))}
        onClick={onSubmit}
      >
        {submitLabel}
      </button>
    </div>
  );
}
