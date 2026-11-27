import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/format";
import type { Tone } from "@/lib/protocol";

/* Small shadcn-style primitives (cva + Tailwind), kept local to avoid a heavy component dependency. */

export const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 rounded-[10px] text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-45 whitespace-nowrap",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:bg-accent/90",
        secondary: "border border-fg/80 bg-transparent text-fg hover:bg-fg hover:text-bg",
        ghost: "text-fg-muted hover:bg-surface-2 hover:text-fg",
        danger: "border border-danger/40 bg-danger-soft text-danger hover:bg-danger/10",
      },
      size: { sm: "h-9 px-4", md: "h-11 px-5", lg: "h-12 px-7 text-sm" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonStyles>) {
  return <button className={cn(buttonStyles({ variant, size }), className)} {...props} />;
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-border bg-surface", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-border px-5 py-4 sm:px-6 sm:py-5", className)}>
      <div className="min-w-0">
        <h2 className="text-[22px] text-fg">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-fg-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const toneStyles: Record<Tone, string> = {
  neutral: "bg-surface-2 text-fg-muted border-border",
  info: "bg-info-soft text-info border-info/20",
  accent: "bg-accent-soft text-accent border-accent/25",
  success: "bg-success-soft text-success border-success/25",
  warning: "bg-warning-soft text-warning border-warning/25",
  danger: "bg-danger-soft text-danger border-danger/25",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium", toneStyles[tone], className)}>
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-fg">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-[10px] border border-border-strong bg-surface px-4 text-[13px] text-fg placeholder:text-fg-subtle focus-visible:outline-2 disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
});

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="tabular mt-1.5 truncate text-xl font-medium tracking-tight text-fg">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-fg-subtle">{sub}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-surface-2", className)} />;
}

export function Notice({ tone = "info", title, children }: { tone?: Tone; title: string; children?: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border px-4 py-3 text-[13px]", toneStyles[tone])} role={tone === "danger" ? "alert" : "status"}>
      <div className="font-medium">{title}</div>
      {children && <div className="mt-1 text-[13px] leading-relaxed opacity-90">{children}</div>}
    </div>
  );
}
