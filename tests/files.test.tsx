import { beforeEach, describe, expect, mock, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { fileName, filePath, fileUrlPath, parseFileUrl } from "@/lib/file-links";

// Files on tasks: what their names and addresses look like, what they're served as, who may upload and read them,
// and how Markdown shows them. Storage and the database are a small stand-in that keeps what it's given

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const objects = new Map<string, { bytes: Uint8Array; type: string; at: string }>();
let bucketMade = false;

function query(table: string) {
  const filters: [string, unknown][] = [];
  const q = {
    select: () => q,
    eq: (col: string, value: unknown) => {
      filters.push([col, value]);
      return q;
    },
    maybeSingle: async () => {
      const row = (tables[table] ?? []).find((r) =>
        filters.every(([c, v]) => (c === "workspaces.slug" ? (r.workspace_slug as string) === v : r[c] === v)),
      );
      return { data: row ?? null, error: null };
    },
  };
  return q;
}

const storage = {
  createBucket: async () => {
    bucketMade = true;
    return { error: null };
  },
  from: () => ({
    upload: async (path: string, bytes: Uint8Array, o: { contentType: string }) => {
      if (!bucketMade) return { error: { message: "Bucket not found" } };
      objects.set(path, { bytes, type: o.contentType, at: new Date().toISOString() });
      return { error: null };
    },
    list: async (folder: string) => ({
      data: [...objects]
        .filter(([p]) => p.startsWith(`${folder}/`))
        .map(([p, o]) => ({ name: p.slice(folder.length + 1), created_at: o.at, metadata: { size: o.bytes.length, mimetype: o.type } })),
      error: null,
    }),
    download: async (path: string) => {
      const o = objects.get(path);
      return o ? { data: new Blob([o.bytes as BlobPart], { type: o.type }), error: null } : { data: null, error: { message: "Object not found" } };
    },
    remove: async (paths: string[]) => {
      paths.forEach((p) => objects.delete(p));
      return { error: null };
    },
  }),
};

mock.module("server-only", () => ({}));
mock.module("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: query, storage }),
  serviceReady: true,
}));
const files = await import("@/lib/files");
const { Markdown } = await import("@/components/ui/markdown");

const ws = "11111111-1111-4111-8111-111111111111";
const board = "22222222-2222-4222-8222-222222222222";
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const origin = "https://acta.test";

beforeEach(() => {
  objects.clear();
  bucketMade = false;
  tables.boards = [{ id: board, workspace_id: ws, prefix: "ACT", roadmap_public: false, slug: "acta", workspace_slug: "aaen" }];
  tables.members = [
    { workspace_id: ws, user_id: "owner", role: "owner", permissions: {} },
    { workspace_id: ws, user_id: "viewer", role: "viewer", permissions: { comment: false } },
    { workspace_id: ws, user_id: "member", role: "member", permissions: {} },
  ];
  tables.tasks = [
    { board_id: board, number: 7, public: true, deleted_at: null },
    { board_id: board, number: 8, public: false, deleted_at: null },
    { board_id: board, number: 9, public: false, deleted_at: "2026-11-01" },
  ];
});

describe("file names and addresses", () => {
  test("names keep to what's safe in a path and a Markdown link", () => {
    expect(fileName("Screenshot 2026-11-15 at 10.04.12.png")).toBe("Screenshot-2026-11-15-at-10.04.12.png");
    expect(fileName("../../etc/passwd")).toBe("etc-passwd");
    expect(fileName("café (1).jpg")).toBe("cafe-1-.jpg");
    expect(fileName("")).toBe("file");
    const long = fileName(`${"a".repeat(200)}.png`);
    expect(long.length).toBe(80);
    expect(long.endsWith(".png")).toBe(true);
  });

  test("an address reads back as where the file is", () => {
    const id = "33333333-3333-4333-8333-333333333333";
    const path = fileUrlPath(board, 7, id, "shot.png");
    expect(parseFileUrl(`https://acta.aaenz.no${path}`)).toEqual({ board, task: 7, id, name: "shot.png" });
    expect(parseFileUrl(path)).toEqual({ board, task: 7, id, name: "shot.png" });
    expect(parseFileUrl("https://example.com/shot.png")).toBeNull();
    expect(filePath(board, 7, id, "shot.png")).toBe(`${board}/7/${id}-shot.png`);
  });
});

describe("what files are served as", () => {
  test("images are known by their bytes, whatever they claim", () => {
    expect(files.storedType(png, "text/html", "x.html")).toBe("image/png");
    expect(files.storedType(new TextEncoder().encode("GIF89a...."), "", "a.gif")).toBe("image/gif");
  });

  test("nothing uploaded can run as a page", () => {
    const html = new TextEncoder().encode("<script>alert(1)</script>");
    expect(files.storedType(html, "text/html", "x.html")).toBe("application/octet-stream");
    expect(files.storedType(new TextEncoder().encode("<svg onload=alert(1)>"), "image/svg+xml", "x.svg")).toBe(
      "application/octet-stream",
    );
    const h = files.serveHeaders("application/octet-stream", "x.html", 10, "member");
    expect(h["Content-Type"]).toBe("application/octet-stream");
    expect(h["Content-Disposition"]).toStartWith("attachment");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Content-Security-Policy"]).toContain("sandbox");
  });

  test("images, PDFs and text open in place", () => {
    expect(files.serveHeaders("image/png", "a.png", 1, "member")["Content-Disposition"]).toStartWith("inline");
    expect(files.serveHeaders("text/plain", "a.log", 1, "public")["Content-Type"]).toBe("text/plain; charset=utf-8");
    expect(files.serveHeaders("image/png", "a.png", 1, "public")["Cache-Control"]).toStartWith("public");
    expect(files.serveHeaders("image/png", "a.png", 1, "member")["Cache-Control"]).toStartWith("private");
  });
});

describe("who can upload and read", () => {
  const upload = (userId: string | null, task: string | null = "ACT-8", extra = {}) =>
    files.uploadFile(
      userId ? { userId, ...extra } : null,
      { board: "aaen/acta", task, name: "shot.png", type: "image/png", bytes: png },
      origin,
    );

  test("a member's upload makes the bucket when it isn't there, and comes back as Markdown", async () => {
    const f = await upload("member");
    expect(bucketMade).toBe(true);
    expect(f.image).toBe(true);
    expect(f.task).toBe(8);
    expect(f.url).toBe(`${origin}/api/files/${board}/8/${f.id}/shot.png`);
    expect(f.markdown).toBe(`![shot.png](${f.url})`);
    expect(await files.listFiles({ userId: "member" }, board, "ACT-8", origin)).toEqual([
      { ...f, uploaded: expect.any(String) },
    ]);
  });

  test("uploads need a member who may comment, a key that may write, and a live task", async () => {
    expect(upload(null)).rejects.toThrow("Sign in");
    expect(upload("stranger")).rejects.toThrow("no such board");
    expect(upload("viewer")).rejects.toThrow("can’t add files");
    expect(upload("member", "ACT-9")).rejects.toThrow("no task ACT-9");
    expect(upload("member", "XYZ-1")).rejects.toThrow("isn’t a task");
    expect(upload("owner", "ACT-8", { agentWrites: false })).rejects.toThrow("only read");
    expect(upload("owner", "ACT-8", { workspaces: ["elsewhere"] })).rejects.toThrow("no such board");
    expect(objects.size).toBe(0);
  });

  test("a file before its task exists belongs to the board", async () => {
    const f = await upload("owner", null);
    expect(f.task).toBeNull();
    expect(f.url).toContain(`/${board}/0/`);
  });

  test("members read every file, and the public only those on public tasks of a published roadmap", async () => {
    const shown = await upload("owner", "ACT-7");
    const hidden = await upload("owner", "ACT-8");
    const early = await upload("owner", null);
    const read = (who: string | null, f: typeof shown) =>
      files.readFile(who ? { userId: who } : null, board, f.task ?? 0, f.id, f.name);

    expect((await read("viewer", hidden))?.who).toBe("member");
    expect(await read(null, shown)).toBeNull();
    tables.boards[0].roadmap_public = true;
    expect((await read(null, shown))?.who).toBe("public");
    expect(await read(null, hidden)).toBeNull();
    expect(await read(null, early)).toBeNull();
    expect(await read("stranger", hidden)).toBeNull();
    // A name that doesn't match its stored one, or tries to climb out, finds nothing
    expect(await files.readFile({ userId: "owner" }, board, 8, hidden.id, "../shot.png")).toBeNull();
  });

  test("only people who can edit remove files", async () => {
    const f = await upload("member");
    expect(files.removeFile({ userId: "viewer" }, board, 8, f.id, f.name)).rejects.toThrow("can’t remove");
    await files.removeFile({ userId: "member" }, board, 8, f.id, f.name);
    expect(objects.size).toBe(0);
  });
});

describe("Markdown", () => {
  const id = "33333333-3333-4333-8333-333333333333";
  const url = `https://acta.aaenz.no${fileUrlPath(board, 7, id, "shot.png")}`;

  test("shows images from Acta and the web, with a click to see them full size", () => {
    const html = renderToString(<Markdown source={`Look:\n![the bug](${url})`} />);
    expect(html).toContain(`<img src="${url}" alt="the bug"`);
    expect(html).toContain("View the bug");
    expect(renderToString(<Markdown source="![x](https://example.com/a.png)" />)).toContain("<img");
  });

  test("never shows an image from somewhere unsafe", () => {
    for (const src of ["javascript:alert(1)", "http://example.com/a.png", "data:image/png;base64,AAAA", "#upload-ab12"]) {
      const html = renderToString(<Markdown source={`![nope](${src})`} />);
      expect(html).not.toContain("<img");
      expect(html).toContain("nope");
    }
  });

  test("a link to a file is a chip with its name", () => {
    const html = renderToString(<Markdown source={`[report.pdf](${url.replace("shot.png", "report.pdf")})`} />);
    expect(html).toContain("report.pdf");
    expect(html).not.toContain("<img");
    expect(html).toContain('target="_blank"');
  });
});
