"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { track } from "@/components/analytics";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/display";
import { getBrowserClient } from "@/lib/supabase/client";
import { authReady, providers, safeNext } from "@/lib/supabase/env";

const errors: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Send a new one.",
  provider: "The sign-in was cancelled or didn’t go through. Try again.",
  incomplete: "That sign-in link is incomplete. Send a new one.",
};

const oauth: { id: "google" | "github"; label: string; icon: IconName }[] = [
  { id: "google", label: "Continue with Google", icon: "google" },
  { id: "github", label: "Continue with GitHub", icon: "github" },
];

export function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(errors[params.get("error") ?? ""] ?? null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (!authReady) return;
    getBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) router.replace(next);
      });
  }, [next, router]);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const sendLink = async (address: string) => {
    setBusy("email");
    setProblem(null);
    const { error } = await getBrowserClient().auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: callback() },
    });
    setBusy(null);
    if (error) {
      setProblem(
        error.status === 429
          ? "Too many links in a short while. Wait a minute and try again."
          : "We couldn’t send the link. Check the address and try again.",
      );
      return;
    }
    track("sign_in_link_sent");
    setSentTo(address);
    setWait(60);
  };

  const withProvider = async (provider: "google" | "github") => {
    setBusy(provider);
    setProblem(null);
    track("sign_in_started", { method: provider });
    const { error } = await getBrowserClient().auth.signInWithOAuth({ provider, options: { redirectTo: callback() } });
    if (error) {
      setBusy(null);
      setProblem(errors.provider);
    }
  };

  if (!authReady)
    return (
      <div className="border border-dashed border-line-strong p-5 text-sm text-ink-2">
        Sign-in isn’t connected yet. Add the Supabase keys to the environment to turn it on.
      </div>
    );

  if (sentTo)
    return (
      <div>
        <span className="grid size-12 place-items-center border border-ink bg-raised">
          <Icon name="mail" size="lg" className="text-lapis" />
        </span>
        <h1 className="mt-6 font-display text-3xl">Check your inbox</h1>
        <p className="mt-2 text-sm text-ink-2">
          We sent a sign-in link to <span className="font-medium text-ink">{sentTo}</span>. Open it on this device and
          you’re in.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button disabled={wait > 0 || busy !== null} onClick={() => sendLink(sentTo)}>
            {busy === "email" ? <Spinner /> : <Icon name="reset" />}
            {wait > 0 ? `Send again in ${wait}s` : "Send again"}
          </Button>
          <Button variant="ghost" onClick={() => setSentTo(null)}>
            Use another email
          </Button>
        </div>
        {problem ? <p className="mt-4 text-sm text-hematite">{problem}</p> : null}
      </div>
    );

  const social = oauth.filter((o) => providers.includes(o.id));

  return (
    <div>
      <h1 className="font-display text-4xl">Sign in</h1>
      <p className="mt-2 text-sm text-ink-2">New here? The same steps make your account.</p>

      {problem ? (
        <p role="alert" className="mt-6 border border-hematite/40 bg-hematite-soft px-3 py-2.5 text-sm text-hematite-ink">
          {problem}
        </p>
      ) : null}

      {social.length ? (
        <div className="mt-8 flex flex-col gap-2">
          {social.map((o) => (
            <Button
              key={o.id}
              size="lg"
              disabled={busy !== null}
              onClick={() => withProvider(o.id)}
              className="w-full justify-start text-sm"
            >
              {busy === o.id ? <Spinner /> : <Icon name={o.icon} />}
              {o.label}
            </Button>
          ))}
        </div>
      ) : null}

      {social.length && providers.includes("email") ? (
        <div className="my-6 flex items-center gap-3 font-mono text-[11px] text-ink-3">
          <span className="h-px flex-1 bg-line" />
          or with email
          <span className="h-px flex-1 bg-line" />
        </div>
      ) : null}

      {providers.includes("email") ? (
        <form
          className={social.length ? "" : "mt-8"}
          onSubmit={(e) => {
            e.preventDefault();
            const address = email.trim().toLowerCase();
            if (address) sendLink(address);
          }}
        >
          <label htmlFor="email" className="text-xs font-medium text-ink-2">
            Email
          </label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            autoFocus={!social.length}
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 h-11"
          />
          <Button type="submit" variant="primary" size="lg" disabled={busy !== null} className="mt-3 w-full">
            {busy === "email" ? <Spinner className="[&>span.spin-cell]:bg-on-accent/40" /> : <Icon name="mail" />}
            Email me a sign-in link
          </Button>
        </form>
      ) : null}
    </div>
  );
}
