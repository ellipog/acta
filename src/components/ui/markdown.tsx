"use client";

import { createContext, memo, useContext, useEffect, useRef, useState } from "react";
import { Dialog as D } from "radix-ui";
import { formatBytes, maxFileBytes, parseFileUrl, type FileInfo } from "@/lib/file-links";
import { githubRef, plainLinkText } from "@/lib/github-links";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icons";
import { toast } from "./toast";
import { Tooltip } from "./tooltip";

const inlinePattern =
  /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|!\[[^\]]*\]\([^)\s]+\)|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s<>()[\]]*[^\s<>()[\].,;:!?'"*]|@[A-Za-z]+)/g;

const linkClass = "text-lapis underline decoration-lapis/40 underline-offset-2 hover:decoration-lapis";

// Where an image may come from: the web over https, or Acta's own files, by their whole address or their path
const imageSource = (url: string) => (/^https:\/\//.test(url) || /^\/api\/files\//.test(url) || parseFileUrl(url) ? url : null);

/** An image in Markdown. A click shows it full size */
function MarkdownImage({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  if (broken)
    return (
      <a href={src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-3 hover:text-ink">
        <Icon name="file" size="sm" />
        <span className="underline decoration-line-strong underline-offset-2">{alt || "Image"}</span>
      </a>
    );
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger asChild>
        <button
          type="button"
          aria-label={alt ? `View ${alt}` : "View image"}
          className="my-1 inline-block max-w-full cursor-zoom-in border border-line bg-sunken align-top outline-none hover:border-line-strong focus-visible:border-lapis"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- pictures people paste come from anywhere, at any size */}
          <img
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
            className="block max-h-80 w-auto max-w-full object-contain"
          />
        </button>
      </D.Trigger>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] bg-ink/70" />
        <D.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[60] grid place-items-center p-4 focus:outline-none"
          onClick={() => setOpen(false)}
        >
          <D.Title className="sr-only">{alt || "Image"}</D.Title>
          {/* eslint-disable-next-line @next/next/no-img-element -- shown at its own size */}
          <img src={src} alt={alt} className="max-h-[calc(100dvh-5rem)] max-w-full cursor-zoom-out border border-line bg-raised object-contain" />
          <div className="mt-2 flex items-center gap-3 text-xs text-page">
            {alt ? <span className="max-w-[60vw] truncate">{alt}</span> : null}
            <a href={src} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="underline underline-offset-2">
              Open original
            </a>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

// A link to a file on a task shows as a chip with its name
function FileChip({ href, label }: { href: string; label: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={href}
      className="inline-flex max-w-full items-center gap-1 border border-line bg-sunken px-1 align-[-0.15em] text-[0.9em] leading-[1.35] text-ink no-underline hover:border-lapis hover:text-lapis"
    >
      <Icon name="file" size="sm" className="text-ink-3" />
      <span className="truncate">{label}</span>
    </a>
  );
}

// A GitHub link shows as a chip saying what it points at, like calcite#45
function GitHubChip({ href, label, title }: { href: string; label: React.ReactNode; title?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title ?? href}
      className="inline-flex max-w-full items-center gap-1 border border-line bg-sunken px-1 align-[-0.15em] font-mono text-[0.85em] leading-[1.35] text-ink no-underline hover:border-lapis hover:text-lapis"
    >
      <Icon name="github" size="sm" className="text-ink-3" />
      <span className="truncate">{label}</span>
    </a>
  );
}

function inline(text: string, key: string): React.ReactNode[] {
  return text.split(inlinePattern).map((part, i) => {
    const k = `${key}-${i}`;
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={k} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
    if (/^\*[^*].*\*$/.test(part)) return <em key={k}>{part.slice(1, -1)}</em>;
    if (/^`[^`]+`$/.test(part))
      return (
        <code key={k} className="border border-line bg-sunken px-1 font-mono text-[0.85em] text-ink">
          {part.slice(1, -1)}
        </code>
      );
    const image = part.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (image) {
      const src = imageSource(image[2]);
      if (src) return <MarkdownImage key={k} src={src} alt={image[1]} />;
      // Still uploading, or from somewhere it can't be shown
      return (
        <span key={k} className="inline-flex items-center gap-1 text-ink-3">
          <Icon name="file" size="sm" />
          {image[1] || "Image"}
        </span>
      );
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      const safe = /^(https?:|mailto:|\/)/.test(link[2]) ? link[2] : "#";
      if (parseFileUrl(safe)) return <FileChip key={k} href={safe} label={link[1]} />;
      const ref = githubRef(safe);
      if (ref) return <GitHubChip key={k} href={safe} label={plainLinkText(link[1], safe) ? ref.label : link[1]} />;
      // Links within the site open in place
      const away = safe.startsWith("/") ? {} : { target: "_blank", rel: "noreferrer" };
      return (
        <a key={k} href={safe} {...away} className={linkClass}>
          {link[1]}
        </a>
      );
    }
    if (/^https?:\/\//.test(part)) {
      const ref = githubRef(part);
      if (ref) return <GitHubChip key={k} href={part} label={ref.label} />;
      return (
        <a key={k} href={part} target="_blank" rel="noreferrer" className={cn(linkClass, "break-all")}>
          {part.replace(/^https?:\/\/(www\.)?/, "")}
        </a>
      );
    }
    if (/^@[A-Za-z]+$/.test(part))
      return (
        <span key={k} className="bg-lapis-soft px-0.5 text-lapis-ink">
          {part}
        </span>
      );
    return part;
  });
}

type Align = "left" | "center" | "right" | undefined;
export type MarkdownTable = { head: string[]; align: Align[]; rows: string[][] };

// A table row's cells. The pipes at either end are optional, and \| is a pipe inside a cell
const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, "|"));

const delimiter = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

// Where a table starts in some lines: a header row of cells, then a row of dashes with as many cells
function tableAt(lines: string[], i: number) {
  const head = lines[i];
  const rule = lines[i + 1];
  if (!head?.includes("|") || !rule || !delimiter.test(rule)) return false;
  return cells(head).length === cells(rule).length;
}

/** Splits a block into tables and the text around them, so a table can follow a line of text with no gap */
export function splitTables(block: string): string[] {
  const lines = block.split("\n");
  const parts: string[] = [];
  let text: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!tableAt(lines, i)) {
      text.push(lines[i]);
      continue;
    }
    if (text.length) parts.push(text.join("\n"));
    text = [];
    let end = i + 2;
    while (end < lines.length && lines[end].includes("|")) end++;
    parts.push(lines.slice(i, end).join("\n"));
    i = end - 1;
  }
  if (text.length) parts.push(text.join("\n"));
  return parts;
}

/** A GitHub-style table, or null when the block isn't one */
export function parseTable(block: string): MarkdownTable | null {
  const lines = block.split("\n");
  if (!tableAt(lines, 0)) return null;
  const head = cells(lines[0]);
  const align = cells(lines[1]).map((c): Align => {
    const left = c.startsWith(":");
    const right = c.endsWith(":");
    return left && right ? "center" : right ? "right" : left ? "left" : undefined;
  });
  // Rows keep to the header's width, like GitHub's: short ones get empty cells and long ones lose the extra
  const rows = lines.slice(2).map((l) => {
    const row = cells(l).slice(0, head.length);
    return [...row, ...Array<string>(head.length - row.length).fill("")];
  });
  return { head, align, rows };
}

const alignClass = { left: "text-left", center: "text-center", right: "text-right tabular-nums" };

function Table({ table, id }: { table: MarkdownTable; id: string }) {
  return (
    <div className="overflow-x-auto border border-line">
      <table className="w-full border-collapse text-[13px] leading-snug">
        <thead className="bg-sunken">
          <tr>
            {table.head.map((h, i) => (
              <th
                key={i}
                scope="col"
                className={cn(
                  "border-b border-line px-2.5 py-1.5 font-medium whitespace-nowrap text-ink",
                  alignClass[table.align[i] ?? "left"],
                )}
              >
                {inline(h, `${id}-h${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r} className="border-b border-line last:border-0">
              {row.map((c, i) => (
                <td key={i} className={cn("px-2.5 py-1.5 align-top", alignClass[table.align[i] ?? "left"])}>
                  {inline(c, `${id}-${r}-${i}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Drawn again only when its text changes. A task's description and comments sit beside fields that redraw with
// every key typed into them, and parsing each comment again with each key would slow typing down
export const Markdown = memo(function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = source
    .trim()
    .split(/(```[\s\S]*?```)/)
    .flatMap((part, i) =>
      i % 2 ? [part] : part.replace(/^(#{1,3}\s.+)$/gm, "\n$1\n").split(/\n{2,}/).flatMap(splitTables),
    )
    .map((b) => b.trim())
    .filter(Boolean);
  return (
    <div className={cn("space-y-2.5 text-sm leading-relaxed text-ink-2", className)}>
      {blocks.map((block, b) => {
        const lines = block.split("\n");
        const table = !block.startsWith("```") && parseTable(block);
        if (table) return <Table key={b} table={table} id={`${b}`} />;
        if (lines.every((l) => /^\s*[-*]\s/.test(l)))
          return (
            <ul key={b} className="space-y-1">
              {lines.map((l, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden className="mt-[0.6em] size-1 shrink-0 bg-ink-3" />
                  <span>{inline(l.replace(/^\s*[-*]\s/, ""), `${b}-${i}`)}</span>
                </li>
              ))}
            </ul>
          );
        if (lines.every((l) => /^\s*\d+\.\s/.test(l)))
          return (
            <ol key={b} className="space-y-1">
              {lines.map((l, i) => (
                <li key={i} className="flex gap-2">
                  <span className="w-4 shrink-0 font-mono text-[11px] leading-[1.6rem] text-ink-3">{i + 1}.</span>
                  <span>{inline(l.replace(/^\s*\d+\.\s/, ""), `${b}-${i}`)}</span>
                </li>
              ))}
            </ol>
          );
        if (lines.every((l) => l.startsWith(">")))
          return (
            <blockquote key={b} className="border-l-2 border-line-strong pl-3 text-ink-3">
              {inline(lines.map((l) => l.replace(/^>\s?/, "")).join(" "), `${b}`)}
            </blockquote>
          );
        const heading = block.match(/^(#{1,3})\s(.+)$/);
        if (heading && lines.length === 1)
          return (
            <p key={b} className="font-display text-base text-ink">
              {inline(heading[2], `${b}`)}
            </p>
          );
        if (block.startsWith("```") && block.endsWith("```"))
          return (
            <pre key={b} className="overflow-x-auto border border-line bg-sunken p-2.5 font-mono text-xs text-ink">
              {block.replace(/^```\w*\n?|```$/g, "")}
            </pre>
          );
        return (
          <p key={b}>
            {lines.map((l, i) => (
              <span key={i}>
                {i ? <br /> : null}
                {inline(l, `${b}-${i}`)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
});

const tools: { icon: IconName | "b" | "i" | "code"; label: string; wrap: [string, string]; line?: boolean }[] = [
  { icon: "b", label: "Bold", wrap: ["**", "**"] },
  { icon: "i", label: "Italic", wrap: ["*", "*"] },
  { icon: "code", label: "Code", wrap: ["`", "`"] },
  { icon: "link", label: "Link", wrap: ["[", "](https://)"] },
  { icon: "list", label: "List", wrap: ["- ", ""], line: true },
];

/** Uploads a file for whatever the editor is writing, such as a task's description or comment */
export type Uploader = (file: File) => Promise<FileInfo>;

// Given by whatever holds the editors, like a task, so every editor in it can take pasted and dropped files
export const UploadContext = createContext<Uploader | null>(null);

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 3,
  onSubmit,
  autoFocus,
  className,
  onUpload,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  onSubmit?: () => void;
  autoFocus?: boolean;
  className?: string;
  onUpload?: Uploader;
  "aria-label"?: string;
}) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const given = useContext(UploadContext);
  const upload = onUpload ?? given;
  // The text as it is now, for uploads that finish after more has been typed
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  const change = (next: string) => {
    latest.current = next;
    onChange(next);
  };

  // Each file goes in at the caret as a placeholder at once, and becomes its Markdown when it's uploaded
  const addFiles = (files: File[]) => {
    if (!upload || !files.length) return;
    const el = ref.current;
    const at = el ? el.selectionEnd : latest.current.length;
    const marks: [File, string][] = files.map((f) => [f, `![Uploading ${f.name.replace(/[[\]]/g, "")}…](#upload-${Math.random().toString(36).slice(2, 8)})`]);
    const before = latest.current.slice(0, at);
    const gap = before && !before.endsWith("\n") ? "\n" : "";
    const inserted = gap + marks.map(([, m]) => m).join("\n") + "\n";
    change(before + inserted + latest.current.slice(at));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + inserted.length, at + inserted.length);
    });
    for (const [file, mark] of marks) {
      const swap = (text: string) => {
        // Gone when it was deleted, or the text was saved and the editor closed meanwhile
        if (latest.current.includes(mark)) change(latest.current.replace(mark, text));
      };
      if (file.size > maxFileBytes) {
        swap("");
        toast({ icon: "file", title: `${file.name} is too large`, description: `Files can be up to ${formatBytes(maxFileBytes)}.` });
        continue;
      }
      setUploading((n) => n + 1);
      upload(file)
        .then((f) => swap(f.markdown))
        .catch((error: unknown) => {
          swap("");
          toast({ icon: "file", title: `${file.name} didn’t upload`, description: error instanceof Error ? error.message : undefined });
        })
        .finally(() => setUploading((n) => n - 1));
    }
  };

  const apply = (wrap: [string, string], line?: boolean) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const start = line ? value.lastIndexOf("\n", a - 1) + 1 : a;
    const chosen = value.slice(start, b);
    const next = value.slice(0, start) + wrap[0] + chosen + wrap[1] + value.slice(b);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + wrap[0].length + chosen.length + (chosen ? wrap[1].length : 0);
      el.setSelectionRange(chosen ? caret : start + wrap[0].length, chosen ? caret : start + wrap[0].length);
    });
  };

  return (
    <div className={cn("border border-line-strong bg-raised focus-within:border-lapis", className)}>
      <div className="flex items-center border-b border-line">
        {(["write", "preview"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={cn(
              "-mb-px h-8 border-b-2 px-3 text-xs capitalize outline-none focus-visible:bg-sunken",
              tab === t ? "border-lapis text-ink" : "border-transparent text-ink-3 hover:text-ink",
            )}
          >
            {t}
          </button>
        ))}
        {tab === "write" ? (
          <div className="ml-auto flex items-center pr-1">
            {tools.map((t) => (
              <Tooltip key={t.label} content={t.label}>
                <button
                  type="button"
                  aria-label={t.label}
                  onClick={() => apply(t.wrap, t.line)}
                  className="grid size-7 place-items-center text-ink-3 hover:bg-sunken hover:text-ink"
                >
                  {t.icon === "b" ? (
                    <span className="font-mono text-xs font-bold">B</span>
                  ) : t.icon === "i" ? (
                    <span className="font-mono text-xs italic">I</span>
                  ) : t.icon === "code" ? (
                    <span className="font-mono text-xs">{"<>"}</span>
                  ) : (
                    <Icon name={t.icon} size="sm" />
                  )}
                </button>
              </Tooltip>
            ))}
            {upload ? (
              <Tooltip content="Attach an image or file">
                <button
                  type="button"
                  aria-label="Attach an image or file"
                  onClick={() => picker.current?.click()}
                  className="grid size-7 place-items-center text-ink-3 hover:bg-sunken hover:text-ink"
                >
                  <Icon name="upload" size="sm" />
                </button>
              </Tooltip>
            ) : null}
            {upload ? (
              <input
                ref={picker}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  addFiles([...(e.target.files ?? [])]);
                  e.target.value = "";
                }}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      {tab === "write" ? (
        <div className="relative">
        <textarea
          ref={ref}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => {
            const files = [...e.clipboardData.files];
            if (!upload || !files.length) return;
            e.preventDefault();
            addFiles(files);
          }}
          onDragOver={(e) => {
            if (!upload || !e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            setDragging(false);
            const files = [...e.dataTransfer.files];
            if (!upload || !files.length) return;
            e.preventDefault();
            addFiles(files);
          }}
          onKeyDown={(e) => {
            if (onSubmit && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSubmit();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === "b") {
              e.preventDefault();
              apply(["**", "**"]);
            }
            if ((e.metaKey || e.ctrlKey) && e.key === "i") {
              e.preventDefault();
              apply(["*", "*"]);
            }
          }}
          rows={rows}
          placeholder={placeholder}
          aria-label={ariaLabel}
          className={cn(
            "block w-full resize-y bg-transparent px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-ink-3",
            dragging && "bg-lapis-soft",
          )}
        />
          {upload ? (
            <p aria-live="polite" className="pointer-events-none border-t border-line px-3 py-1 text-[11px] text-ink-3">
              {uploading ? `Uploading ${uploading === 1 ? "a file" : `${uploading} files`}…` : "Paste, drop or attach images and files."}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="min-h-[4.5rem] px-3 py-2">
          {value.trim() ? <Markdown source={value} /> : <p className="text-sm text-ink-3">Nothing to preview.</p>}
        </div>
      )}
    </div>
  );
}
