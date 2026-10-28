import { NextResponse, type NextRequest } from "next/server";
import { githubReady } from "@/lib/github/app";
import { flushOutbox } from "@/lib/github/sync";
import { getAuth } from "@/lib/workspace";

// A board saved changes to tasks that sync with GitHub issues. Anyone who can see the board can ask for them to be
// sent, and only what's waiting goes
export async function POST(request: NextRequest) {
  if (!githubReady) return new NextResponse(null, { status: 204 });
  const auth = await getAuth();
  if (!auth) return new NextResponse(null, { status: 401 });
  const board = request.nextUrl.searchParams.get("board") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(board)) return new NextResponse(null, { status: 400 });
  // Row security only shows the board to its members
  const { data } = await auth.supabase.from("boards").select("id").eq("id", board).maybeSingle();
  if (!data) return new NextResponse(null, { status: 404 });
  try {
    await flushOutbox(board);
  } catch (error) {
    console.error("GitHub flush failed", error);
  }
  return new NextResponse(null, { status: 204 });
}
