import type { Feature } from "./feature";

// Automatically discover all features in the subdirectories.
// Vite glob loader to the rescue! :D
const modules = import.meta.glob<{ default: Feature }>("./*/index.ts", {
  eager: true,
});

export const Features: Feature[] = Object.values(modules)
  .map((mod) => mod.default)
  .filter((feat): feat is Feature => !!feat && "name" in feat);
