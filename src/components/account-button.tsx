"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { hasSession, loadClient } from "@/lib/supabase/browser";
import { authReady } from "@/lib/supabase/env";

export const profileEvent = "acta:profile";

// Signed-out visitors never see the menu, so its code loads only for people who are signed in
const AccountMenu = dynamic(() => import("./account-menu").then((m) => m.AccountMenu), {
  loading: () => <span aria-hidden className="w-9" />,
});

const still = () => () => {};

// Null while rendering on the server, then whether there's a session cookie
function useSignedIn() {
  return useSyncExternalStore(still, () => authReady && hasSession(), () => null);
}

export function HeaderCta() {
  const signedIn = useSignedIn();
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
  const signedIn = useSignedIn();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    let stop = () => {};
    void loadClient().then((supabase) => {
      if (!alive) return;
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
      stop = () => {
        data.subscription.unsubscribe();
        window.removeEventListener(profileEvent, reload);
      };
    });
    return () => {
      alive = false;
      stop();
    };
  }, [signedIn]);

  if (!authReady) return null;
  if (signedIn === null || (signedIn && !me)) return <span aria-hidden className="w-9" />;
  if (!me?.user)
    return (
      <Button variant="ghost" asChild>
        <Link href="/login">Sign in</Link>
      </Button>
    );

  return <AccountMenu name={me.name} email={me.user.email ?? ""} avatar={me.avatar} admin={me.admin} />;
}
