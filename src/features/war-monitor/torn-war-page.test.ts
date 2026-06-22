import { afterEach, describe, expect, it } from "vitest";
import {
  getFactionIds,
  getMemberLists,
  getMemberRows,
  getSortedColumn,
} from "./torn-war-page";

// Minimal fake DOM tree — just enough to support the specific selector
// patterns torn-war-page.ts actually uses, not a general CSS engine.
class FakeElement {
  tagName: string;
  className = "";
  children: FakeElement[] = [];
  parentNode: FakeElement | null = null;
  private attrs: Record<string, string> = {};

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get href() {
    return this.attrs.href ?? "";
  }

  setAttribute(name: string, value: string) {
    this.attrs[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }

  appendChild(child: FakeElement): FakeElement {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  private matchesSimple(selector: string): boolean {
    // tag[attr^='value']
    const attrPrefixMatch = selector.match(
      /^(\w+)\[(\w[\w-]*)\^=['"]([^'"]+)['"]\]$/,
    );
    if (attrPrefixMatch) {
      const [, tag, attr, prefix] = attrPrefixMatch;
      return (
        this.tagName === tag.toUpperCase() &&
        (this.getAttribute(attr) ?? "").startsWith(prefix)
      );
    }
    // tag.class
    const tagClassMatch = selector.match(/^(\w+)\.([\w-]+)$/);
    if (tagClassMatch) {
      const [, tag, cls] = tagClassMatch;
      return this.tagName === tag.toUpperCase() && this.hasClass(cls);
    }
    // .class
    if (selector.startsWith(".")) {
      return this.hasClass(selector.slice(1));
    }
    // tag
    return this.tagName === selector.toUpperCase();
  }

  private hasClass(cls: string): boolean {
    return this.className.split(/\s+/).includes(cls);
  }

  private matchesAny(selector: string): boolean {
    return selector
      .split(",")
      .map((s) => s.trim())
      .some((s) => this.matchesSimple(s));
  }

  private allDescendants(): FakeElement[] {
    const result: FakeElement[] = [];
    for (const child of this.children) {
      result.push(child, ...child.allDescendants());
    }
    return result;
  }

  querySelectorAll(selector: string): FakeElement[] {
    return this.allDescendants().filter((el) => el.matchesAny(selector));
  }

  querySelector(selector: string): FakeElement | null {
    // Supports a descendant chain like "div.member div" by narrowing in
    // sequence; each part is matched against descendants of the prior match.
    const parts = selector
      .split(" ")
      .map((s) => s.trim())
      .filter(Boolean);
    let scope: FakeElement[] = [this];
    for (const part of parts) {
      const next: FakeElement[] = [];
      for (const el of scope) {
        next.push(...el.allDescendants().filter((d) => d.matchesAny(part)));
      }
      scope = next;
      if (scope.length === 0) return null;
    }
    return scope[0] ?? null;
  }
}

function fakeDocument(roots: FakeElement[]) {
  const body = new FakeElement("body");
  for (const root of roots) body.appendChild(root);
  return {
    querySelector: (selector: string) => body.querySelector(selector),
    querySelectorAll: (selector: string) => body.querySelectorAll(selector),
  };
}

function memberList(): FakeElement {
  const ul = new FakeElement("ul");
  ul.className = "members-list";
  return ul;
}

function factionAnchor(href: string): FakeElement {
  const a = new FakeElement("a");
  a.setAttribute("href", href);
  return a;
}

// Builds the header-row structure getSortedColumn reads (the column divs
// live alongside the member list under a shared parent), optionally marking
// one column as actively sorted, and attaches `ul` under that same parent.
function attachSortHeader(
  ul: FakeElement,
  active?: {
    column: "member" | "level" | "points" | "status";
    order: "asc" | "desc";
  },
): void {
  const parent = new FakeElement("div");
  for (const col of ["member", "level", "points", "status"] as const) {
    const outer = new FakeElement("div");
    outer.className = col;
    const inner = new FakeElement("div");
    if (active?.column === col) {
      inner.className = `activeIcon__abc ${active.order}__xyz`;
    }
    outer.appendChild(inner);
    parent.appendChild(outer);
  }
  parent.appendChild(ul);
}

function memberRow(options: {
  href?: string;
  withStatusDiv?: boolean;
  className?: string;
}): FakeElement {
  const li = new FakeElement("li");
  li.className = options.className ?? "enemy";
  if (options.href !== undefined) {
    const profileAnchor = new FakeElement("a");
    profileAnchor.setAttribute("href", options.href);
    li.appendChild(profileAnchor);
  }
  if (options.withStatusDiv ?? true) {
    const statusDiv = new FakeElement("div");
    statusDiv.className = "status";
    li.appendChild(statusDiv);
  }
  return li;
}

afterEach(() => {
  // @ts-expect-error test-only global cleanup
  delete global.document;
});

describe("getMemberLists", () => {
  it("returns every ul.members-list element on the page", () => {
    const ul = memberList();
    global.document = fakeDocument([ul]) as unknown as Document;

    expect(getMemberLists()).toEqual([ul]);
  });

  it("returns multiple lists when more than one is present", () => {
    const ul1 = memberList();
    const ul2 = memberList();
    global.document = fakeDocument([ul1, ul2]) as unknown as Document;

    expect(getMemberLists()).toEqual([ul1, ul2]);
  });
});

describe("getFactionIds", () => {
  it("extracts the ID param from each list's faction anchor", () => {
    const ul = memberList();
    ul.appendChild(factionAnchor("/factions.php?ID=999"));
    global.document = fakeDocument([ul]) as unknown as Document;

    expect(getFactionIds()).toEqual(["999"]);
  });

  it("skips a list whose faction anchor is missing entirely", () => {
    const ul = memberList();
    global.document = fakeDocument([ul]) as unknown as Document;

    expect(getFactionIds()).toEqual([]);
  });

  it("skips a list whose faction anchor has no ID param", () => {
    const ul = memberList();
    ul.appendChild(factionAnchor("/factions.php?XID=999"));
    global.document = fakeDocument([ul]) as unknown as Document;

    expect(getFactionIds()).toEqual([]);
  });
});

describe("getMemberRows", () => {
  it("extracts id (from XID), li, and statusDiv for each row, across lists", () => {
    const ul1 = memberList();
    const row1 = memberRow({ href: "/profiles.php?XID=111" });
    ul1.appendChild(row1);

    const ul2 = memberList();
    const row2 = memberRow({ href: "/profiles.php?XID=222" });
    ul2.appendChild(row2);

    global.document = fakeDocument([ul1, ul2]) as unknown as Document;

    const rows = getMemberRows();

    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe("111");
    expect(rows[0].li).toBe(row1);
    expect(rows[0].statusDiv).not.toBeNull();
    expect(rows[1].id).toBe("222");
  });

  it("includes li.your rows alongside li.enemy rows", () => {
    const ul = memberList();
    ul.appendChild(
      memberRow({ href: "/profiles.php?XID=333", className: "your" }),
    );
    global.document = fakeDocument([ul]) as unknown as Document;

    expect(getMemberRows()).toHaveLength(1);
  });

  it("skips a row whose profile anchor is missing", () => {
    const ul = memberList();
    ul.appendChild(memberRow({}));
    global.document = fakeDocument([ul]) as unknown as Document;

    expect(getMemberRows()).toEqual([]);
  });

  it("skips a row whose href has no XID param", () => {
    const ul = memberList();
    ul.appendChild(memberRow({ href: "/profiles.php?ID=444" }));
    global.document = fakeDocument([ul]) as unknown as Document;

    expect(getMemberRows()).toEqual([]);
  });

  it("returns statusDiv: null when a row has no div.status child", () => {
    const ul = memberList();
    ul.appendChild(
      memberRow({ href: "/profiles.php?XID=555", withStatusDiv: false }),
    );
    global.document = fakeDocument([ul]) as unknown as Document;

    const rows = getMemberRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].statusDiv).toBeNull();
  });
});

describe("getSortedColumn", () => {
  it("reports the actively sorted column and direction (status, asc)", () => {
    const ul = memberList();
    attachSortHeader(ul, { column: "status", order: "asc" });

    expect(getSortedColumn(ul as unknown as Element)).toEqual({
      column: "status",
      order: "asc",
    });
  });

  it("reports the actively sorted column and direction (member, desc)", () => {
    const ul = memberList();
    attachSortHeader(ul, { column: "member", order: "desc" });

    expect(getSortedColumn(ul as unknown as Element)).toEqual({
      column: "member",
      order: "desc",
    });
  });

  it("returns column: null, order: null when nothing is actively sorted", () => {
    const ul = memberList();
    attachSortHeader(ul);

    expect(getSortedColumn(ul as unknown as Element)).toEqual({
      column: null,
      order: null,
    });
  });

  it("returns column: null, order: null when the list has no parent", () => {
    const ul = memberList();

    expect(getSortedColumn(ul as unknown as Element)).toEqual({
      column: null,
      order: null,
    });
  });
});
