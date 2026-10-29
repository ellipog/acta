import type { Metadata } from "next";
import { BoardApp } from "@/components/board-app/board-app";

export const metadata: Metadata = {
  title: "Try the demo board",
  description:
    "A working Acta board to try without an account: drag cards, edit tasks, switch to the table and timeline. Saved in your browser.",
  alternates: { canonical: "/demo" },
};

export default function DemoPage() {
  return <BoardApp variant="full" />;
}
