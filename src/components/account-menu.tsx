"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { openAppearance } from "@/lib/appearance";
import { loadClient } from "@/lib/supabase/browser";

export function AccountMenu({
  name,
  email,
  avatar,
  admin,
}: {
  name: string;
  email: string;
  avatar: string | null;
  admin: boolean;
}) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Your account"
        className="grid size-9 place-items-center outline-none hover:bg-sunken focus-visible:ring-2 focus-visible:ring-lapis data-[state=open]:bg-sunken"
      >
        <Avatar name={name} src={avatar} size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="normal-case">
          <span className="block truncate text-sm font-medium text-ink">{name}</span>
          <span className="block truncate font-sans text-xs text-ink-3">{email}</span>
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
        {admin ? (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <Icon name="chart" /> Analytics
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={openAppearance}>
          <Icon name="palette" /> Appearance
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await (await loadClient()).auth.signOut();
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
