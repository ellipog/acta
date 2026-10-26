import Link from "next/link";
import { LogoMark } from "@/components/ui/logo-mark";

// On its own so pages like sign-in can show it without the site header's theme toggle and account menu
export function Wordmark({ className = "", href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark />
      <span className="font-display text-xl tracking-[0.18em]">ACTA</span>
    </Link>
  );
}
