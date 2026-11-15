import { FileProblem, readFile, removeFile, serveHeaders } from "@/lib/files";
import { serviceReady } from "@/lib/supabase/admin";
import { askerFor } from "../../../../asker";

type Params = { params: Promise<{ board: string; task: string; id: string; name: string }> };

const missing = () =>
  new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });

// One file. Members of the board's workspace, by session or key, can read it, and so can anyone when its task is on
// a published roadmap. Everyone else is told there's nothing here, so a file's address gives nothing away
export async function GET(request: Request, { params }: Params) {
  if (!serviceReady) return missing();
  const { board, task, id, name } = await params;
  if (!/^\d+$/.test(task)) return missing();
  const asker = await askerFor(request);
  const found = await readFile(asker === "bad key" ? null : asker, board, Number(task), id, decodeURIComponent(name));
  if (!found) return missing();
  return new Response(found.blob.stream(), {
    headers: serveHeaders(found.blob.type || "application/octet-stream", decodeURIComponent(name), found.blob.size, found.who),
  });
}

export async function DELETE(request: Request, { params }: Params) {
  if (!serviceReady) return missing();
  const { board, task, id, name } = await params;
  const asker = await askerFor(request);
  if (asker === "bad key") return Response.json({ error: "That Acta key doesn’t work." }, { status: 401 });
  try {
    await removeFile(asker, board, Number(task), id, decodeURIComponent(name));
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof FileProblem) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
