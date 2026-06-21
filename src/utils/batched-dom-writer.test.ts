import { describe, expect, it, vi } from "vitest";
import { BatchedDomWriter } from "./batched-dom-writer";

function fakeElement(initialAttrs: Record<string, string> = {}) {
  const attrs: Record<string, string> = { ...initialAttrs };
  return {
    getAttribute: (name: string) => attrs[name] ?? null,
    setAttribute: vi.fn((name: string, value: string) => {
      attrs[name] = value;
    }),
  } as unknown as Element & { setAttribute: ReturnType<typeof vi.fn> };
}

function fakeStyledElement(initialStyles: Record<string, string> = {}) {
  const styles: Record<string, string> = { ...initialStyles };
  return {
    getAttribute: () => null,
    setAttribute: vi.fn(),
    style: {
      getPropertyValue: (prop: string) => styles[prop] ?? "",
      setProperty: vi.fn((prop: string, value: string) => {
        styles[prop] = value;
      }),
    },
  } as unknown as HTMLElement & {
    style: { setProperty: ReturnType<typeof vi.fn> };
  };
}

describe("BatchedDomWriter", () => {
  describe("setAttr", () => {
    it("queues a write and returns true when the value differs from the live attribute", () => {
      const writer = new BatchedDomWriter({ groups: {} });
      const el = fakeElement({ "data-foo": "old" });

      const changed = writer.setAttr(el, "data-foo", "new");

      expect(changed).toBe(true);
      writer.flush();
      expect(el.setAttribute).toHaveBeenCalledWith("data-foo", "new");
    });

    it("returns false and queues nothing when the value matches the live attribute", () => {
      const writer = new BatchedDomWriter({ groups: {} });
      const el = fakeElement({ "data-foo": "same" });

      const changed = writer.setAttr(el, "data-foo", "same");

      expect(changed).toBe(false);
      writer.flush();
      expect(el.setAttribute).not.toHaveBeenCalled();
    });

    it("returns false on a second call in the same batch with the same value", () => {
      const writer = new BatchedDomWriter({ groups: {} });
      const el = fakeElement({ "data-foo": "old" });

      writer.setAttr(el, "data-foo", "new");
      const changedAgain = writer.setAttr(el, "data-foo", "new");

      expect(changedAgain).toBe(false);
    });

    it("returns false when called again after flush() with the same value", () => {
      const writer = new BatchedDomWriter({ groups: {} });
      const el = fakeElement({ "data-foo": "old" });

      writer.setAttr(el, "data-foo", "new");
      writer.flush();
      const changedAfterFlush = writer.setAttr(el, "data-foo", "new");

      expect(changedAfterFlush).toBe(false);
    });
  });

  describe("flush() dirty groups", () => {
    it("includes a group's name when one of its attributes changed", () => {
      const writer = new BatchedDomWriter({
        groups: { sort: ["data-sortA"] },
      });
      const el = fakeElement({ "data-sortA": "0" });

      writer.setAttr(el, "data-sortA", "1");
      const dirtyGroups = writer.flush();

      expect(dirtyGroups.has("sort")).toBe(true);
    });

    it("does not include a group whose attributes were untouched this batch", () => {
      const writer = new BatchedDomWriter({
        groups: { sort: ["data-sortA"] },
      });

      // No setAttr call at all this batch.
      const dirtyGroups = writer.flush();

      expect(dirtyGroups.has("sort")).toBe(false);
    });

    it("contributes a group only once even when multiple of its attributes change", () => {
      const writer = new BatchedDomWriter({
        groups: { sort: ["data-sortA", "data-location"] },
      });
      const el = fakeElement({ "data-sortA": "0", "data-location": "" });

      writer.setAttr(el, "data-sortA", "1");
      writer.setAttr(el, "data-location", "MX");
      const dirtyGroups = writer.flush();

      expect(dirtyGroups.size).toBe(1);
      expect(dirtyGroups.has("sort")).toBe(true);
    });

    it("never marks any group dirty for an attribute that belongs to none", () => {
      const writer = new BatchedDomWriter({
        groups: { sort: ["data-sortA"] },
      });
      const el = fakeElement({ "data-twse-overridden": "false" });

      writer.setAttr(el, "data-twse-overridden", "true");
      const dirtyGroups = writer.flush();

      expect(dirtyGroups.size).toBe(0);
    });

    it("resets for the next batch after flush()", () => {
      const writer = new BatchedDomWriter({
        groups: { sort: ["data-sortA"] },
      });
      const el = fakeElement({ "data-sortA": "0" });

      writer.setAttr(el, "data-sortA", "1");
      const firstFlush = writer.flush();
      const secondFlush = writer.flush();

      expect(firstFlush.has("sort")).toBe(true);
      expect(secondFlush.size).toBe(0);
    });
  });

  describe("setStyle", () => {
    it("queues a write and commits it on flush() when the value differs", () => {
      const writer = new BatchedDomWriter({ groups: {} });
      const el = fakeStyledElement({ "--twse-content": '"old"' });

      writer.setStyle(el, "--twse-content", '"new"');
      writer.flush();

      expect(el.style.setProperty).toHaveBeenCalledWith(
        "--twse-content",
        '"new"',
      );
    });

    it("queues nothing when the value matches the live style", () => {
      const writer = new BatchedDomWriter({ groups: {} });
      const el = fakeStyledElement({ "--twse-content": '"same"' });

      writer.setStyle(el, "--twse-content", '"same"');
      writer.flush();

      expect(el.style.setProperty).not.toHaveBeenCalled();
    });

    it("queues nothing again after flush() with the same value", () => {
      const writer = new BatchedDomWriter({ groups: {} });
      const el = fakeStyledElement({ "--twse-content": '"old"' });

      writer.setStyle(el, "--twse-content", '"new"');
      writer.flush();
      writer.setStyle(el, "--twse-content", '"new"');
      writer.flush();

      expect(el.style.setProperty).toHaveBeenCalledTimes(1);
    });

    it("never contributes to any dirty group", () => {
      const writer = new BatchedDomWriter({
        groups: { sort: ["data-sortA"] },
      });
      const el = fakeStyledElement({ "--twse-content": '"old"' });

      writer.setStyle(el, "--twse-content", '"new"');
      const dirtyGroups = writer.flush();

      expect(dirtyGroups.size).toBe(0);
    });
  });
});
