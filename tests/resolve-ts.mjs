import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs", ".cjs", ".json"];

function resolveRelative(specifier, parentURL) {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return undefined;
  if (!parentURL?.startsWith("file:")) return undefined;
  const base = path.resolve(path.dirname(fileURLToPath(parentURL)), specifier);
  if (path.extname(base) && fs.existsSync(base)) return pathToFileURL(base).href;
  for (const ext of EXTENSIONS) {
    if (fs.existsSync(base + ext)) return pathToFileURL(base + ext).href;
  }
  for (const index of ["index.ts", "index.tsx", "index.js"]) {
    const candidate = path.join(base, index);
    if (fs.existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  return undefined;
}

export async function resolve(specifier, context, nextResolve) {
  const relative = resolveRelative(specifier, context.parentURL);
  if (relative) return { url: relative, shortCircuit: true };
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error && error.code === "ERR_MODULE_NOT_FOUND" && !specifier.startsWith(".") && !specifier.startsWith("node:")) {
      return nextResolve(`${specifier}.js`, context);
    }
    throw error;
  }
}
