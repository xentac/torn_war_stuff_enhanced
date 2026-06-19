import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `boot()` runs immediately as a side effect of importing "./index", so each test
// needs a fresh module instance (vi.resetModules + dynamic import) to control the
// mocked Features list per scenario.
const { runMock, shouldRunMock } = vi.hoisted(() => ({
  runMock: vi.fn(),
  shouldRunMock: vi.fn(),
}));

vi.mock("./features", () => ({
  Features: [
    {
      name: "test-feature",
      description: "",
      executionTime: 0, // StartTime.DocumentStart
      shouldRun: shouldRunMock,
      run: runMock,
    },
  ],
}));

function createDocumentMock() {
  const attrs = new Set<string>();
  return {
    documentElement: {
      hasAttribute: (key: string) => attrs.has(key),
      setAttribute: (key: string) => {
        attrs.add(key);
      },
      removeAttribute: (key: string) => {
        attrs.delete(key);
      },
    },
    readyState: "complete",
    body: {},
    addEventListener: vi.fn(),
  };
}

describe("boot", () => {
  beforeEach(() => {
    vi.resetModules();
    runMock.mockReset();
    shouldRunMock.mockReset();
    shouldRunMock.mockResolvedValue(true);
    global.document = createDocumentMock() as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs features on first boot", async () => {
    await import("./index");
    // boot() is fire-and-forget at module scope; flush microtasks.
    await Promise.resolve();
    await Promise.resolve();

    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it("does not run features again if the page is already marked as injected", async () => {
    global.document.documentElement.setAttribute("data-twse-injected", "true");

    await import("./index");
    await Promise.resolve();
    await Promise.resolve();

    expect(runMock).not.toHaveBeenCalled();
  });

  it("marks the document as injected so a second boot on the same page is skipped", async () => {
    await import("./index");
    await Promise.resolve();
    await Promise.resolve();
    expect(runMock).toHaveBeenCalledTimes(1);

    vi.resetModules();
    runMock.mockReset();

    await import("./index");
    await Promise.resolve();
    await Promise.resolve();

    expect(runMock).not.toHaveBeenCalled();
  });
});
