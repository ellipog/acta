import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getAuth, getMyTasks, lastBoardIn } from "@/lib/workspace";
import { MyTasksFrame, MyTasksView } from "./my-tasks-view";

export const metadata: Metadata = {
  title: "My tasks · Acta",
  robots: { index: false, follow: false },
};

export default function MyTasksPage({ params }: PageProps<"/[workspace]/my-tasks">) {
  return (
    // The inner fallback reads the address, which only the browser knows when it moves here. The outer one is
    // what the page starts as
    <Suspense fallback={<MyTasksFrame />}>
      <Suspense fallback={<MyTasksFrame cached />}>
        <MyTasks params={params} />
      </Suspense>
    </Suspense>
  );
}

async function MyTasks({ params }: { params: PageProps<"/[workspace]/my-tasks">["params"] }) {
  const { workspace: slug } = await params;
  const data = await getMyTasks(slug);
  if (!data) {
    if (!(await getAuth())) redirect(`/login?next=${encodeURIComponent(`/${slug}/my-tasks`)}`);
    if (await lastBoardIn(slug)) redirect("/home?stale");
    notFound();
  }
  const { me, workspace, workspaces, boards, members } = data;
  return (
    <MyTasksView shell={{ me, workspace, workspaces, boards, members }} boards={data.myBoards} tasks={data.tasks} />
  );
}
