import { beforeEach, expect, test } from "bun:test";

// How Acta looks on a device. A choice made in the panel is saved, put on the page at once, and put on the page
// again by the script in the root layout before the next visit paints

class FakeRoot {
  attrs = new Map<string, string>();
  props = new Map<string, string>();
  style = {
    setProperty: (k: string, v: string) => this.props.set(k, v),
    removeProperty: (k: string) => this.props.delete(k),
  };
  setAttribute = (k: string, v: string) => this.attrs.set(k, v);
  removeAttribute = (k: string) => this.attrs.delete(k);
  toggleAttribute = (k: string, on: boolean) => (on ? this.attrs.set(k, "") : this.attrs.delete(k), on);
}

const store = new Map<string, string>();
let root = new FakeRoot();
const g = globalThis as Record<string, unknown>;
g.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
};
g.location = { pathname: "/acme/launch" };
Object.defineProperty(g, "document", { get: () => ({ documentElement: root }), configurable: true });

const { appearanceScript, getAppearance, resetAppearance, setAppearance, defaultAppearance } = await import(
  "@/lib/appearance"
);

const reload = () => {
  root = new FakeRoot();
  new Function(appearanceScript)();
};

beforeEach(() => {
  resetAppearance();
  root = new FakeRoot();
});

test("a choice shows at once and again on the next visit", () => {
  setAppearance({ accent: "amethyst", surface: "cool", size: "lg", contrast: "more", motion: "reduced" });
  const now = Object.fromEntries(root.attrs);
  expect(now).toMatchObject({
    "data-accent": "amethyst",
    "data-surface": "cool",
    "data-size": "lg",
    "data-contrast": "more",
    "data-motion": "reduced",
  });
  reload();
  expect(Object.fromEntries(root.attrs)).toMatchObject(now);
});

test("a colour of your own carries its shade, and text on a light one turns dark", () => {
  setAppearance({ accent: "custom", color: "#f5e66b" });
  expect(root.props.get("--accent-custom")).toBe("#f5e66b");
  expect(root.attrs.has("data-accent-light")).toBe(true);
  reload();
  expect(root.props.get("--accent-custom")).toBe("#f5e66b");
  expect(root.attrs.has("data-accent-light")).toBe(true);

  setAppearance({ color: "#1f3a7a" });
  expect(root.attrs.has("data-accent-light")).toBe(false);
});

test("going back to a preset keeps the colour for later", () => {
  setAppearance({ accent: "custom", color: "#a1b2c3" });
  setAppearance({ accent: "lapis" });
  expect(root.props.has("--accent-custom")).toBe(false);
  expect(getAppearance().color).toBe("#a1b2c3");
});

test("a custom accent needs a colour", () => {
  setAppearance({ accent: "custom", color: "" });
  expect(getAppearance().accent).toBe("lapis");
});

test("reset clears everything, on the page and in storage", () => {
  setAppearance({ accent: "rhodonite", font: "mono" });
  resetAppearance();
  expect(root.attrs.size).toBe(0);
  expect(store.size).toBe(0);
  expect(getAppearance()).toEqual(defaultAppearance);
});

test("damaged storage falls back to the plain look", () => {
  store.set("acta-appearance", "{nope");
  expect(getAppearance()).toEqual(defaultAppearance);
  reload();
  expect(root.attrs.size).toBe(0);
});

test("public roadmaps keep their owner's look", () => {
  setAppearance({ accent: "obsidian" });
  g.location = { pathname: "/p/acme/launch" };
  reload();
  expect(root.attrs.size).toBe(0);
  g.location = { pathname: "/acme/launch" };
});
