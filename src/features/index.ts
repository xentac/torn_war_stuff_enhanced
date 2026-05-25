import type { Feature } from "./feature";

// Automatically discover all features in the subdirectories.
// Vite glob loader to the rescue! :D
const modules = import.meta.glob("./*/index.ts", {
  eager: true,
}) as Record<string, { default: Feature }>;

export const Features: Feature[] = Object.values(modules)
  .map((mod) => mod.default)
  .filter((feat): feat is Feature => !!feat && "name" in feat);
