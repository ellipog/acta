import { expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  boardLabels,
  branchName,
  closingNumbers,
  defaultRepoSettings,
  issueStatus,
  newer,
  nextStatus,
  prState,
  repoSettings,
  stamp,
  taskNumbers,
} from "../src/lib/github/match";
import { readState, signatureOk, signState } from "../src/lib/github/signature";

// GitHub without GitHub: that webhooks and install links can't be forged, that pull requests, branches and commits
// find the right tasks, that automation only ever moves a task forward, and that two-way issue sync lets the later
// edit win on each side

const secret = "shh";
const sign = (body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

test("a webhook is only trusted with GitHub's signature over its exact body", () => {
  const body = JSON.stringify({ action: "opened" });
  expect(signatureOk(secret, body, sign(body))).toBe(true);
  expect(signatureOk(secret, body + " ", sign(body))).toBe(false);
  expect(signatureOk(secret, body, sign(body).replace("sha256=", "sha1="))).toBe(false);
  expect(signatureOk(secret, body, null)).toBe(false);
  expect(signatureOk("", body, sign(body))).toBe(false);
  expect(signatureOk("other", body, sign(body))).toBe(false);
});

test("an install link's state can't be changed or reused after it expires", () => {
  const state = signState(secret, { workspace: "w1", user: "u1" });
  expect(readState(secret, state)).toMatchObject({ workspace: "w1", user: "u1" });
  expect(readState("other", state)).toBeNull();

  const [body, sig] = state.split(".");
  const forged = Buffer.from(JSON.stringify({ workspace: "w2", user: "u1", exp: Date.now() + 60_000 })).toString(
    "base64url",
  );
  expect(readState(secret, `${forged}.${sig}`)).toBeNull();
  expect(readState(secret, `${body}.`)).toBeNull();
  expect(readState(secret, "nonsense")).toBeNull();
  expect(readState(secret, signState(secret, { workspace: "w1", user: "u1" }, -1))).toBeNull();
});

test("task ids are found in any case, and only whole ones for this board", () => {
  expect(taskNumbers("ACT-12: add export", "ACT")).toEqual([12]);
  expect(taskNumbers("act-12-add-csv-export", "ACT")).toEqual([12]);
  expect(taskNumbers("feature/act-3 and ACT-4, ACT-3 again", "ACT")).toEqual([3, 4]);
  expect(taskNumbers("REACT-12 and FACT-9 and ACT-120x", "ACT")).toEqual([]);
  expect(taskNumbers("ACT-1234567890", "ACT")).toEqual([]);
  expect(taskNumbers("CAL-5", "ACT")).toEqual([]);
  expect(taskNumbers(null, "ACT")).toEqual([]);
});

test("closing keywords mark which tasks a pull request finishes", () => {
  expect(closingNumbers("Fixes ACT-12", "ACT")).toEqual([12]);
  expect(closingNumbers("closes: act-3, ACT-4 and ACT-5", "ACT")).toEqual([3, 4, 5]);
  expect(closingNumbers("Resolved ACT-7\nRelated to ACT-8", "ACT")).toEqual([7]);
  expect(closingNumbers("See ACT-9", "ACT")).toEqual([]);
  expect(closingNumbers("prefixes ACT-9", "ACT")).toEqual([]);
});

test("branch names start with the task id and stay short", () => {
  expect(branchName("ACT-12", "Add CSV export!")).toBe("act-12-add-csv-export");
  expect(branchName("ACT-1", "???")).toBe("act-1");
  expect(branchName("ACT-2", "A very long title that goes on and on and on forever").length).toBeLessThanOrEqual(40);
  expect(taskNumbers(branchName("ACT-12", "Fix ACT-99 crash"), "ACT")).toContain(12);
});

test("automation moves tasks forward, never back, and each step can be turned off", () => {
  const s = defaultRepoSettings;
  expect(nextStatus("todo", "started", s)).toBe("in_progress");
  expect(nextStatus("backlog", "ready", s)).toBe("review");
  expect(nextStatus("review", "merged", s)).toBe("done");
  expect(nextStatus("review", "started", s)).toBeNull();
  expect(nextStatus("done", "ready", s)).toBeNull();
  expect(nextStatus("canceled", "merged", s)).toBeNull();
  const off = repoSettings({ automation: { done: false } });
  expect(nextStatus("review", "merged", off)).toBeNull();
  expect(nextStatus("todo", "started", off)).toBe("in_progress");
});

test("repository settings fill in defaults and ignore junk", () => {
  expect(repoSettings(null)).toEqual(defaultRepoSettings);
  expect(repoSettings({ issues: true, issueLabel: "  acta  " })).toMatchObject({ issues: true, issueLabel: "acta" });
  expect(repoSettings({ issueLabel: "   " }).issueLabel).toBeUndefined();
  expect(repoSettings({ issueLabel: "x".repeat(80) }).issueLabel).toHaveLength(50);
});

test("pull request and issue states map onto the board", () => {
  expect(prState({ state: "open", draft: true })).toBe("draft");
  expect(prState({ state: "open" })).toBe("open");
  expect(prState({ state: "closed", merged_at: "2026-10-28T10:00:00Z" })).toBe("merged");
  expect(prState({ state: "closed", merged: false })).toBe("closed");
  expect(issueStatus({ state: "open" })).toBe("todo");
  expect(issueStatus({ state: "closed", state_reason: "completed" })).toBe("done");
  expect(issueStatus({ state: "closed", state_reason: "not_planned" })).toBe("canceled");
  expect(issueStatus({ state: "closed", state_reason: "duplicate" })).toBe("canceled");
});

test("issue labels become the board's labels by name, and others are left out", () => {
  expect(boardLabels([{ name: "bug" }, "Design", { name: "wontfix" }], ["Bug", "Feature", "Design"])).toEqual([
    "Bug",
    "Design",
  ]);
  expect(boardLabels([], ["Bug"])).toEqual([]);
});

test("the later edit to each synced field wins, whichever side made it", () => {
  let times = stamp({}, "title", "acta", "2026-10-28T10:00:00Z");
  // GitHub's older edit, arriving late, loses to Acta's
  expect(newer(times, "title", "github", "2026-10-28T09:59:00Z")).toBe(false);
  expect(newer(times, "title", "github", "2026-10-28T10:01:00Z")).toBe(true);
  // Other fields aren't held back by it
  expect(newer(times, "status", "github", "2026-10-28T09:00:00Z")).toBe(true);
  times = stamp(times, "title", "github", "2026-10-28T10:01:00Z");
  expect(newer(times, "title", "acta", "2026-10-28T10:00:30Z")).toBe(false);
  expect(times.acta?.title).toBe("2026-10-28T10:00:00Z");
});
