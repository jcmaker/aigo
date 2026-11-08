type Props = { value: number; onChange: (n: number) => void; min?: number; max?: number };

const BTN =
  "flex size-10 items-center justify-center border border-line-strong text-lg font-bold transition-colors duration-[var(--dur-hover)] hover:bg-invert-bg hover:text-invert-fg disabled:pointer-events-none disabled:opacity-40";

export function QuantityPicker({ value, onChange, min = 1, max = 5 }: Props) {
  return (
    <div className="flex items-center" role="group" aria-label="수량">
      <button type="button" className={`${BTN} rounded-l-app`} aria-label="수량 줄이기" disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <output aria-live="polite" className="flex h-10 min-w-12 items-center justify-center border-y border-line-strong font-mono">
        {value}
      </output>
      <button type="button" className={`${BTN} rounded-r-app`} aria-label="수량 늘리기" disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}
