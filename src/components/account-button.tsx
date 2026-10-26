"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/overlays";
import { getBrowserClient } from "@/lib/supabase/client";
import { authReady } from "@/lib/supabase/env";

export const profileEvent = "acta:profile";

export function HeaderCta() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!authReady) return;
    const { data } = getBrowserClient().auth.onAuthStateChange((_e, session) => setSignedIn(Boolean(session)));
    return () => data.subscription.unsubscribe();
  }, []);
  return (
    <Button variant="primary" asChild>
      {signedIn ? (
        <Link href="/home">
          Open Acta <Icon name="arrow-right" />
        </Link>
      ) : (
        <Link href={authReady ? "/new" : "/demo"}>
          <span className="sm:hidden">Start</span>
          <span className="hidden sm:inline">Start a board</span>
          <Icon name="arrow-right" />
        </Link>
      )}
    </Button>
  );
}

type Me = { user: User | null; name: string; avatar: string | null; admin: boolean };

export function AccountButton() {
  const [me, setMe] = useState<Me | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!authReady) return;
    const supabase = getBrowserClient();
    let alive = true;
    const load = async (user: User | null) => {
      if (!user) {
        if (alive) setMe({ user: null, name: "", avatar: null, admin: false });
        return;
      }
      const [{ data: profile }, { data: admin }] = await Promise.all([
        supabase.from("profiles").select("name, avatar_url").eq("id", user.id).maybeSingle(),
        supabase.from("admins").select("user_id").eq("user_id", user.id).maybeSingle(),
      ]);
      if (alive)
        setMe({
          user,
          name: profile?.name || user.email || "You",
          avatar: profile?.avatar_url ?? null,
          admin: Boolean(admin),
        });
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => load(session?.user ?? null), 0);
    });
    const reload = () => supabase.auth.getSession().then(({ data }) => load(data.session?.user ?? null));
    window.addEventListener(profileEvent, reload);
    return () => {
      alive = false;
      data.subscription.unsubscribe();
      window.removeEventListener(profileEvent, reload);
    };
  }, []);

  if (!authReady) return null;
  if (!me) return <span aria-hidden className="w-9" />;
  if (!me.user)
    return (
      <Button variant="ghost" asChild>
        <Link href="/login">Sign in</Link>
      </Button>
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Your account"
        className="grid size-9 place-items-center outline-none hover:bg-sunken focus-visible:ring-2 focus-visible:ring-lapis data-[state=open]:bg-sunken"
      >
        <Avatar name={me.name} src={me.avatar} size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="normal-case">
          <span className="block truncate text-sm font-medium text-ink">{me.name}</span>
          <span className="block truncate font-sans text-xs text-ink-3">{me.user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/home">
            <Icon name="board" /> Your boards
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account">
            <Icon name="user" /> Account
          </Link>
        </DropdownMenuItem>
        {me.admin ? (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <Icon name="chart" /> Analytics
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await getBrowserClient().auth.signOut();
            router.replace("/");
            router.refresh();
          }}
        >
          <Icon name="sign-out" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
