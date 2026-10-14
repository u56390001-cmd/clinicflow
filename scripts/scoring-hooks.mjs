import { pathToFileURL } from "node:url";
import path from "node:path";

/**
 * Node module-resolution hook that maps the app's `@/` TypeScript path alias
 * onto the repository root. Used only by the standalone scoring golden-case
 * harness so the pure engine can be exercised without a JS test runner.
 */
const root = pathToFileURL(`${process.cwd()}${path.sep}`).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return nextResolve(new URL(`${specifier.slice(2)}.ts`, root).href, context);
  }
  return nextResolve(specifier, context);
}
