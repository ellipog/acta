import { expect, test } from "bun:test";
import { boardReducer, defaultPage, fitPage, pageFrom, pageLimits, safeHref, type BoardState } from "@/lib/board-store";
import { accentVars } from "@/components/board-app/roadmap-page";
import { FakeBoardServer } from "./fake-server";

// What a public page says and links to. Whatever is typed in, or was saved before a setting existed, the page
// loads with every setting in place, its text within bounds and its links opening only web and mail addresses

test("links open web and mail addresses only", () => {
  expect(safeHref("acta.app/docs")).toBe("https://acta.app/docs");
  expect(safeHref("http://example.com")).toBe("http://example.com/");
  expect(safeHref("mailto:hi@acta.app")).toBe("mailto:hi@acta.app");
  expect(safeHref("javascript:alert(1)")).toBeNull();
  expect(safeHref("data:text/html,hi")).toBeNull();
  expect(safeHref("   ")).toBeNull();
});

test("text, links and the changelog stay within bounds", () => {
  const long = "x".repeat(1000);
  const fit = fitPage({
    title: long,
    footer: long,
    announcementLink: long,
    links: Array.from({ length: 9 }, (_, i) => ({ label: long, url: `site${i}.com` })),
    shippedLimit: 9999,
    color: "red",
  });
  expect(fit.title).toHaveLength(pageLimits.text);
  expect(fit.footer).toHaveLength(pageLimits.long);
  expect(fit.announcementLink).toHaveLength(pageLimits.url);
  expect(fit.links).toHaveLength(pageLimits.links);
  expect(fit.links![0].label).toHaveLength(40);
  expect(fit.shippedLimit).toBe(200);
  expect(fit.color).toBe("");
  expect(fitPage({ shippedLimit: -3 }).shippedLimit).toBe(0);
  expect(fitPage({ color: "#A1b2C3" }).color).toBe("#A1b2C3");
});

test("every section shows once, in the chosen order", () => {
  expect(fitPage({ sections: ["shipped", "roadmap"] }).sections).toEqual(["shipped", "roadmap", "ideas"]);
  expect(fitPage({ sections: ["ideas", "ideas", "nope" as never] }).sections).toEqual(["ideas", "roadmap", "shipped"]);
});

test("a page saved before these settings loads with all of them", () => {
  const page = pageFrom("Acta", "acta", { title: "Next up", accent: "pyrite" });
  expect(page.title).toBe("Next up");
  expect(page.accent).toBe("pyrite");
  for (const key of Object.keys(defaultPage) as (keyof typeof defaultPage)[])
    if (key !== "title" && key !== "accent" && key !== "slug") expect(page[key]).toEqual(defaultPage[key]);
});

test("a damaged saved page still loads", () => {
  const page = pageFrom("Acta", "acta", { links: "nope", sections: 3, cta: { label: 4 }, color: "url(x)" });
  expect(page.links).toEqual([]);
  expect(page.sections).toEqual(defaultPage.sections);
  expect(page.color).toBe("");
  expect(page.cta.url).toBe("");
});

test("editing the page goes through the same checks", () => {
  const before: BoardState = new FakeBoardServer().load();
  const after = boardReducer(before, {
    type: "page",
    patch: { announcement: "y".repeat(500), sections: ["ideas"], links: [{ label: "Docs", url: "acta.app" }] },
  });
  expect(after.roadmap.page.announcement).toHaveLength(pageLimits.text);
  expect(after.roadmap.page.sections).toEqual(["ideas", "roadmap", "shipped"]);
  expect(after.roadmap.page.links).toEqual([{ label: "Docs", url: "acta.app" }]);
});

test("a page colour sets the accent and readable text on it", () => {
  expect(accentVars("")).toBeUndefined();
  expect(accentVars("#2c4a8c")).toMatchObject({ "--lapis": "#2c4a8c", "--on-accent": "#f7f5ef" });
  expect(accentVars("#f5e66b")).toMatchObject({ "--on-accent": "#11131a" });
});
