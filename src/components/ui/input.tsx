import { cn } from "@/lib/utils";

const field =
  "w-full caret-lapis border border-line-strong bg-raised text-ink placeholder:text-ink-3 transition-colors hover:border-ink-3 focus-visible:border-lapis focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lapis/25 disabled:opacity-50 aria-invalid:border-hematite";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(field, "h-9 px-3 text-sm", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(field, "min-h-24 px-3 py-2 text-sm leading-relaxed", className)} {...props} />;
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-xs font-medium text-ink-2", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-hematite">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}
