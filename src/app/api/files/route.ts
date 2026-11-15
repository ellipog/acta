import { FileProblem, listFiles, uploadFile, type Asker } from "@/lib/files";
import { requestOrigin } from "@/lib/origin";
import { serviceReady } from "@/lib/supabase/admin";
import { askerFor } from "./asker";

// POST a file as multipart form data, with board ("workspace/board" or its id), task (like ACT-12, or left out for a
// file that's on the board before its task exists) and file. Signed-in people send their session, agents and scripts
// their Acta key as a bearer token. The answer has the file's url and the Markdown that shows it.
// GET ?board=&task= lists a task's files

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

async function guarded(request: Request, work: (asker: Asker) => Promise<Response>) {
  if (!serviceReady) return json({ error: "Files aren’t set up on this server." }, 503);
  const asker = await askerFor(request);
  if (asker === "bad key") return json({ error: "That Acta key doesn’t work. It may have been revoked." }, 401);
  try {
    return await work(asker);
  } catch (error) {
    if (error instanceof FileProblem) return json({ error: error.message }, error.status);
    console.error("File request failed", error);
    return json({ error: "Acta couldn’t do that just now. Try again in a moment." }, 500);
  }
}

export async function POST(request: Request) {
  return guarded(request, async (asker) => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return json({ error: "Send the file as multipart form data, in a field called file." }, 400);
    }
    const file = form.get("file");
    const board = form.get("board");
    if (!(file instanceof File)) return json({ error: "Send the file in a field called file." }, 400);
    if (typeof board !== "string" || !board) return json({ error: "Say which board, as workspace/board." }, 400);
    const task = form.get("task");
    const name = form.get("name");
    const saved = await uploadFile(
      asker,
      {
        board,
        task: typeof task === "string" ? task : null,
        name: typeof name === "string" && name ? name : file.name || "file",
        type: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      },
      requestOrigin(request),
    );
    return json(saved, 201);
  });
}

export async function GET(request: Request) {
  return guarded(request, async (asker) => {
    const params = new URL(request.url).searchParams;
    const board = params.get("board");
    if (!board) return json({ error: "Say which board, as workspace/board." }, 400);
    return json({ files: await listFiles(asker, board, params.get("task"), requestOrigin(request)) });
  });
}
