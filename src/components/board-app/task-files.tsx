"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { me } from "@/lib/board-store";
import { formatBytes, type FileInfo } from "@/lib/file-links";
import { cn } from "@/lib/utils";

async function problem(res: Response) {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return new Error(body?.error ?? "Try again in a moment.");
}

/**
 * A task's files, read when its dialog opens, and the upload every editor in the dialog uses. Only boards that
 * are saved have files; the demo has none. pending counts uploads still on their way, so a save can wait for them
 */
export function useTaskFiles(task: string) {
  const board = me.live ? me.board : undefined;
  const [files, setFiles] = useState<FileInfo[] | null>(null);
  const [pending, setPending] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (!board) return;
    const ask = new AbortController();
    fetch(`/api/files?board=${encodeURIComponent(board)}&task=${encodeURIComponent(task)}`, { signal: ask.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ files: FileInfo[] }>) : null))
      .then((body) => {
        if (body) setFiles(body.files);
      })
      .catch(() => {});
    return () => {
      alive.current = false;
      ask.abort();
    };
  }, [board, task]);

  const upload = useCallback(
    async (file: File) => {
      if (!board) throw new Error("Files can be added once the board is saved.");
      setPending((n) => n + 1);
      try {
        const form = new FormData();
        form.set("board", board);
        form.set("task", task);
        form.set("file", file, file.name || "pasted.png");
        const res = await fetch("/api/files", { method: "POST", body: form });
        if (!res.ok) throw await problem(res);
        const saved = (await res.json()) as FileInfo;
        if (alive.current) setFiles((list) => [...(list ?? []), saved]);
        return saved;
      } finally {
        setPending((n) => n - 1);
      }
    },
    [board, task],
  );

  const remove = useCallback(async (f: FileInfo) => {
    const res = await fetch(new URL(f.url, location.href).pathname, { method: "DELETE" });
    if (!res.ok) throw await problem(res);
    setFiles((list) => (list ?? []).filter((x) => x.id !== f.id));
  }, []);

  return { files, upload: board ? upload : null, remove, pending };
}

/** The task's files under its description, with a button to attach more */
export function TaskFiles({
  files,
  upload,
  remove,
  canEdit,
}: {
  files: FileInfo[] | null;
  upload: ((file: File) => Promise<FileInfo>) | null;
  remove: (f: FileInfo) => Promise<void>;
  canEdit: boolean;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!upload) return null;
  const list = files ?? [];

  const add = async (chosen: File[]) => {
    setBusy(true);
    for (const file of chosen) {
      try {
        await upload(file);
      } catch (error) {
        toast({ icon: "file", title: `${file.name} didn’t upload`, description: (error as Error).message });
      }
    }
    setBusy(false);
  };

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-ink-2">
          Files {list.length ? <span className="font-mono text-[11px] font-normal text-ink-3">{list.length}</span> : null}
        </h3>
        <button
          type="button"
          onClick={() => picker.current?.click()}
          disabled={busy}
          className="flex items-center gap-1 text-[11px] text-ink-3 hover:text-ink disabled:opacity-50"
        >
          <Icon name="upload" size="sm" />
          {busy ? "Uploading…" : "Attach"}
        </button>
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            add([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>
      {list.length ? (
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {list.map((f) => (
            <li key={f.id} className="group flex min-w-0 items-center gap-2 border border-line bg-surface p-1.5">
              <a
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="grid size-10 shrink-0 place-items-center overflow-hidden border border-line bg-sunken"
              >
                {f.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a private file, served by Acta itself
                  <img src={f.url} alt="" loading="lazy" className="size-full object-cover" />
                ) : (
                  <Icon name="file" className="text-ink-3" />
                )}
              </a>
              <a href={f.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 hover:text-lapis">
                <span className="block truncate text-[13px]">{f.name}</span>
                <span className="block font-mono text-[11px] text-ink-3">{formatBytes(f.size)}</span>
              </a>
              <Tooltip content="Copy Markdown">
                <button
                  type="button"
                  aria-label={`Copy Markdown for ${f.name}`}
                  onClick={() => {
                    navigator.clipboard?.writeText(f.markdown).catch(() => {});
                    toast({ icon: "copy", title: "Markdown copied", description: f.name, duration: 1800 });
                  }}
                  className={cn(
                    "grid size-7 shrink-0 place-items-center text-ink-3 hover:bg-sunken hover:text-ink",
                    "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
                  )}
                >
                  <Icon name="copy" size="sm" />
                </button>
              </Tooltip>
              {canEdit ? (
                <Tooltip content="Remove">
                  <button
                    type="button"
                    aria-label={`Remove ${f.name}`}
                    onClick={() =>
                      remove(f).catch((error: Error) =>
                        toast({ icon: "file", title: "That didn’t go through", description: error.message }),
                      )
                    }
                    className="grid size-7 shrink-0 place-items-center text-ink-3 opacity-0 group-hover:opacity-100 hover:bg-sunken hover:text-hematite focus-visible:opacity-100 pointer-coarse:opacity-100"
                  >
                    <Icon name="trash" size="sm" />
                  </button>
                </Tooltip>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
