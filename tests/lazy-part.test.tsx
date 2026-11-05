import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { lazyPart } from "@/components/lazy-part";

// renderToString can't wait, so anything that would suspend shows its fallback. That makes it a check on whether
// a part draws in the same render

const Hello = ({ name }: { name: string }) => <p>hello {name}</p>;

describe("lazyPart", () => {
  test("waits behind its own fallback before its code is in", () => {
    const Part = lazyPart(() => Promise.resolve(Hello), <i>loading</i>);
    const html = renderToString(
      <main>
        <Part name="ada" />
      </main>,
    );
    expect(html).toContain("loading");
    expect(html).toContain("<main>");
  });

  test("draws at once when its code was loaded ahead", async () => {
    const Part = lazyPart(() => Promise.resolve(Hello), <i>loading</i>);
    await Part.preload();
    expect(renderToString(<Part name="ada" />)).toContain("hello <!-- -->ada");
  });

  test("a failed download is tried again", async () => {
    let tries = 0;
    const Part = lazyPart(() => (++tries === 1 ? Promise.reject(new Error("offline")) : Promise.resolve(Hello)));
    await expect(Part.preload()).rejects.toThrow("offline");
    await Part.preload();
    expect(tries).toBe(2);
    expect(renderToString(<Part name="ada" />)).toContain("ada");
  });
});
