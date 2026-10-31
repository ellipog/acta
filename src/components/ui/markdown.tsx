"use client";

import { useRef, useState } from "react";
import { githubRef, plainLinkText } from "@/lib/github-links";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icons";
import { Tooltip } from "./tooltip";

const inlinePattern =
  /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s<>()[\]]*[^\s<>()[\].,;:!?'"*]|@[A-Za-z]+)/g;

const linkClass = "text-lapis underline decoration-lapis/40 underline-offset-2 hover:decoration-lapis";

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
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      const safe = /^(https?:|mailto:|\/)/.test(link[2]) ? link[2] : "#";
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

export function Markdown({ source, className }: { source: string; className?: string }) {
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
}

const tools: { icon: IconName | "b" | "i" | "code"; label: string; wrap: [string, string]; line?: boolean }[] = [
  { icon: "b", label: "Bold", wrap: ["**", "**"] },
  { icon: "i", label: "Italic", wrap: ["*", "*"] },
  { icon: "code", label: "Code", wrap: ["`", "`"] },
  { icon: "link", label: "Link", wrap: ["[", "](https://)"] },
  { icon: "list", label: "List", wrap: ["- ", ""], line: true },
];

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 3,
  onSubmit,
  autoFocus,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  onSubmit?: () => void;
  autoFocus?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const ref = useRef<HTMLTextAreaElement>(null);

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
          </div>
        ) : null}
      </div>
      {tab === "write" ? (
        <textarea
          ref={ref}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
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
          className="block w-full resize-y bg-transparent px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-ink-3"
        />
      ) : (
        <div className="min-h-[4.5rem] px-3 py-2">
          {value.trim() ? <Markdown source={value} /> : <p className="text-sm text-ink-3">Nothing to preview.</p>}
        </div>
      )}
    </div>
  );
}
