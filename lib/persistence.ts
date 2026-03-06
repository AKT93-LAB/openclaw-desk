import { promises as fs } from "node:fs";
import path from "node:path";

function resolveDataRoot() {
  return path.resolve(process.cwd(), process.env.MISSION_CONTROL_DATA_DIR ?? ".data");
}

async function ensureDirectory(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function ensureParent(filePath: string) {
  await ensureDirectory(path.dirname(filePath));
}

function resolveFilePath(name: string) {
  return path.join(resolveDataRoot(), name);
}

export async function readJsonFile<T>(name: string, fallback: T): Promise<T> {
  const filePath = resolveFilePath(name);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonFile(name: string, value: unknown) {
  const filePath = resolveFilePath(name);
  await ensureParent(filePath);
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

export async function appendJsonLine(name: string, value: unknown) {
  const filePath = resolveFilePath(name);
  await ensureParent(filePath);
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

export async function readJsonLines<T>(name: string, limit = 50): Promise<T[]> {
  const filePath = resolveFilePath(name);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return lines
      .slice(Math.max(0, lines.length - limit))
      .map((line) => JSON.parse(line) as T);
  } catch {
    return [];
  }
}

