import { describe, expect, test } from "bun:test";
import { parseTable, splitTables } from "@/components/ui/markdown";

// GitHub-style tables, as agents write them in progress comments

describe("markdown tables", () => {
  const bench = ["| Case | Before | After |", "| --- | ---: | :-: |", "| cold start | 412 ms | 180 ms |", "| warm | 40 ms | 38 ms |"];

  test("a table reads as a header, alignments and rows", () => {
    expect(parseTable(bench.join("\n"))).toEqual({
      head: ["Case", "Before", "After"],
      align: [undefined, "right", "center"],
      rows: [
        ["cold start", "412 ms", "180 ms"],
        ["warm", "40 ms", "38 ms"],
      ],
    });
  });

  test("the outer pipes are optional, and \\| is a pipe in a cell", () => {
    expect(parseTable("a | b\n--|--\nx \\| y | z")).toEqual({
      head: ["a", "b"],
      align: [undefined, undefined],
      rows: [["x | y", "z"]],
    });
  });

  test("short rows are filled and long ones cut to the header", () => {
    expect(parseTable("| a | b |\n| - | - |\n| 1 |\n| 1 | 2 | 3 |")?.rows).toEqual([
      ["1", ""],
      ["1", "2"],
    ]);
  });

  test("a table can follow a line of text, and text can follow it", () => {
    const block = ["Benchmarks:", ...bench, "Not a row"].join("\n");
    expect(splitTables(block)).toEqual(["Benchmarks:", bench.join("\n"), "Not a row"]);
  });

  test("pipes without a row of dashes stay text", () => {
    expect(parseTable("a | b\nc | d")).toBeNull();
    expect(splitTables("a | b\nc | d")).toEqual(["a | b\nc | d"]);
  });

  test("a header and dashes with different counts aren't a table", () => {
    expect(parseTable("| a | b |\n| --- |\n| 1 | 2 |")).toBeNull();
  });
});
