import type { ButtonHTMLAttributes } from "react";

type Look = {
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
  full?: boolean;
};

const VARIANTS = {
  primary: "bg-invert-bg text-invert-fg hover:bg-accent-ink",
  secondary: "border border-line-strong text-ink hover:border-transparent hover:bg-invert-bg hover:text-invert-fg",
  danger: "border border-danger text-danger hover:bg-danger hover:text-bg",
};

const SIZES = { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4 text-sm", lg: "h-12 px-[22px] text-[15px]" };

/** 링크를 버튼 모양으로 보일 때도 이 클래스를 쓴다. */
export function buttonClass({ variant = "primary", size = "md", full }: Look = {}) {
  return [
    "inline-flex items-center justify-center gap-2 rounded-app font-bold whitespace-nowrap transition-colors duration-[var(--dur-hover)]",
    "disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    full ? "w-full" : "w-fit",
  ].join(" ");
}

type Props = Look & ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean };

export function Button({ variant, size, full, loading, className = "", disabled, type = "button", ...rest }: Props) {
  return (
    <button
      type={type}
      className={`${buttonClass({ variant, size, full })} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    />
  );
}
