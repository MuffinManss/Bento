import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Reads a cached file if present, otherwise runs `fetcher`, caches, and returns its result. */
export async function cached(filePath: string, fetcher: () => Promise<string>): Promise<string> {
  if (existsSync(filePath)) {
    return readFileSync(filePath, "utf8");
  }
  const text = await fetcher();
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, text, "utf8");
  return text;
}

export function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

export function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
