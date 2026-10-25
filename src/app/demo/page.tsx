import type { Metadata } from "next";
import { BoardApp } from "@/components/board-app/board-app";

export const metadata: Metadata = {
  title: "Demo · Acta",
  description: "A working Acta board: drag cards, edit tasks, switch to the table. Saved in your browser.",
};

export default function DemoPage() {
  return <BoardApp variant="full" />;
}
