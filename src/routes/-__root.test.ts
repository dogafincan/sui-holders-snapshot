import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

describe("RootDocument head", () => {
  it("declares one app manifest and light/dark favicon variants", () => {
    const source = readFileSync(new URL("./__root.tsx", import.meta.url), "utf8");

    expect(source).toContain('rel: "manifest"');
    expect(source).toContain('href: "/manifest.json"');
    expect(source).toContain('rel: "apple-touch-icon"');
    expect(source).toContain('href: "/apple-touch-icon.png"');
    expect(source).toContain('href: "/favicon-light-16x16.png"');
    expect(source).toContain('href: "/favicon-light-32x32.png"');
    expect(source).toContain('href: "/favicon-dark-16x16.png"');
    expect(source).toContain('href: "/favicon-dark-32x32.png"');
    expect(source.split('media: "(prefers-color-scheme: light)"')).toHaveLength(3);
    expect(source.split('media: "(prefers-color-scheme: dark)"')).toHaveLength(3);
  });
});
