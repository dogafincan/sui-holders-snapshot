import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      return sourceFiles(path);
    }

    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe("icon system", () => {
  it("keeps product UI icons on Hugeicons", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const srcFilesWithLucideImports = sourceFiles("src").filter((path) => {
      const source = readFileSync(path, "utf8");
      return /from\s+["']lucide-react["']/.test(source);
    });

    expect(packageJson.dependencies?.["lucide-react"]).toBeUndefined();
    expect(packageJson.devDependencies?.["lucide-react"]).toBeUndefined();
    expect(srcFilesWithLucideImports).toEqual([]);
  });
});
