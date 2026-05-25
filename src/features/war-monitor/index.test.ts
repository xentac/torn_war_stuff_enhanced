import { beforeEach, describe, expect, it, vi } from "vitest";

// 1. Setup localStorage polyfill for vitest
const storageMock: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => storageMock[key] || null,
  setItem: (key: string, value: string) => {
    storageMock[key] = value;
  },
  removeItem: (key: string) => {
    delete storageMock[key];
  },
  clear: () => {
    for (const key of Object.keys(storageMock)) {
      delete storageMock[key];
    }
  },
  key: (index: number) => Object.keys(storageMock)[index] || null,
  get length() {
    return Object.keys(storageMock).length;
  },
};
global.localStorage = localStorageMock as any;

// 2. Setup robust, lightweight MockElement DOM polyfill
class MockElement {
  public tagName: string;
  public id = "";
  public className = "";
  public textContent = "";
  public checked = false;

  get href() {
    return this.getAttribute("href") || "";
  }
  set href(val: string) {
    this.setAttribute("href", val);
  }

  get classList() {
    return {
      add: (cls: string) => {
        if (!this.className.includes(cls)) {
          this.className = this.className ? `${this.className} ${cls}` : cls;
        }
      },
      remove: (cls: string) => {
        this.className = this.className
          .split(" ")
          .filter((c) => c !== cls)
          .join(" ");
      },
      contains: (cls: string) => {
        return this.className.split(" ").includes(cls);
      },
    };
  }
  public style = {
    getPropertyValue: () => "",
    setProperty: () => {},
  };
  public attributes: Record<string, string> = {};
  public parentNode: MockElement | null = null;
  public children: MockElement[] = [];

  get parentElement() {
    return this.parentNode;
  }

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get childNodes() {
    return this.children;
  }

  setAttribute(attr: string, val: string) {
    this.attributes[attr] = val;
  }

  getAttribute(attr: string) {
    return this.attributes[attr] || null;
  }

  appendChild(el: MockElement) {
    el.parentNode = this;
    this.children.push(el);
    return el;
  }

  insertBefore(newChild: MockElement, refChild: MockElement) {
    newChild.parentNode = this;
    const idx = this.children.indexOf(refChild);
    if (idx !== -1) {
      this.children.splice(idx, 0, newChild);
    } else {
      this.children.push(newChild);
    }
    return newChild;
  }

  closest(tag: string) {
    const cleanTag = tag.startsWith(".") ? tag.slice(1) : tag;
    let curr: MockElement | null = this;
    while (curr) {
      if (
        curr.tagName === cleanTag.toUpperCase() ||
        curr.className.includes(cleanTag)
      ) {
        return curr;
      }
      curr = curr.parentNode;
    }
    return null;
  }

  querySelector(selector: string) {
    if (selector.startsWith("#")) {
      const id = selector.slice(1);
      return this.findRecursive((el) => el.id === id);
    }
    if (selector.startsWith(".")) {
      const cls = selector.slice(1);
      return this.findRecursive((el) => el.className.includes(cls));
    }
    if (selector.startsWith("[")) {
      // e.g. [class*="graphIcon"]
      return this.findRecursive((el) => el.className.includes("graphIcon"));
    }
    if (selector.startsWith("a[href")) {
      return this.findRecursive(
        (el) =>
          el.tagName === "A" &&
          (el.getAttribute("href")?.includes("/profiles.php") ?? false),
      );
    }
    return this.findRecursive((el) => el.tagName === selector.toUpperCase());
  }

  querySelectorAll(selector: string) {
    const res: MockElement[] = [];
    this.findAllRecursive((el) => {
      if (selector === "span" && el.tagName === "SPAN") return true;
      if (selector === "a" && el.tagName === "A") return true;
      if (
        selector === "ul.members-list" &&
        el.tagName === "UL" &&
        el.className.includes("members-list")
      )
        return true;
      if (
        selector === "li.enemy, li.your" &&
        el.tagName === "LI" &&
        (el.className.includes("enemy") || el.className.includes("your"))
      )
        return true;
      return false;
    }, res);
    return res;
  }

  private findRecursive(fn: (el: MockElement) => boolean): MockElement | null {
    if (fn(this)) return this;
    for (const ch of this.children) {
      const res = ch.findRecursive(fn);
      if (res) return res;
    }
    return null;
  }

  private findAllRecursive(
    fn: (el: MockElement) => boolean,
    acc: MockElement[],
  ) {
    if (fn(this)) acc.push(this);
    for (const ch of this.children) {
      ch.findAllRecursive(fn, acc);
    }
  }

  private listeners: Record<string, ((...args: any[]) => any)[]> = {};

  addEventListener(event: string, cb: (...args: any[]) => any) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  dispatchEvent(event: any) {
    const type = event.type || event;
    const list = this.listeners[type] || [];
    const ev = typeof event === "object" ? event : { type };
    try {
      ev.preventDefault = ev.preventDefault || (() => {});
      ev.stopPropagation = ev.stopPropagation || (() => {});
    } catch {}
    try {
      Object.defineProperty(ev, "target", {
        value: ev.target || this,
        writable: true,
        configurable: true,
      });
    } catch {}
    for (const cb of list) cb(ev);
    return true;
  }

  set innerHTML(html: string) {
    // Basic parser for our specific template injection
    if (html.includes("twse-war-sort-checkbox")) {
      const checkbox = new MockElement("input");
      checkbox.id = "twse-war-sort-checkbox";
      checkbox.setAttribute("type", "checkbox");
      this.appendChild(checkbox);
    }
  }
}

const documentMock = {
  body: new MockElement("body"),
  createElement(tag: string) {
    return new MockElement(tag);
  },
  getElementById(id: string) {
    return this.body.querySelector(`#${id}`);
  },
  querySelector(sel: string) {
    return this.body.querySelector(sel);
  },
  querySelectorAll(sel: string) {
    return this.body.querySelectorAll(sel);
  },
  documentElement: new MockElement("html"),
  addEventListener: () => {},
  removeEventListener: () => {},
};

global.document = documentMock as any;
global.window = {
  dispatchEvent: () => true,
  addEventListener: () => {},
  getComputedStyle: () => ({ top: "10px" }) as any,
} as any;

// 3. Import dynamic modules
const { twseconfig } = await import("@utils/config");
const { default: WarMonitorFeature } = await import("./index");

describe("WarMonitorFeature Sorting Config", () => {
  beforeEach(() => {
    localStorage.clear();
    documentMock.body = new MockElement("body");
    twseconfig.war_sorting = true;
  });

  it("should have war_sorting enabled by default", () => {
    expect(twseconfig.war_sorting).toBe(true);
  });

  it("should support toggling war_sorting state", () => {
    twseconfig.war_sorting = false;
    expect(twseconfig.war_sorting).toBe(false);
    twseconfig.war_sorting = true;
    expect(twseconfig.war_sorting).toBe(true);
  });

  it("should inject the sorting toggle checkbox right before the graph link element", async () => {
    // 1. Set up target DOM container resembling Torn's war descriptions
    const factionWarList = new MockElement("div");
    factionWarList.id = "faction_war_list_id";

    const descriptions = new MockElement("div");
    descriptions.className = "descriptions";

    const graphIcon = new MockElement("div");
    graphIcon.className = "right c-pointer graphIcon___aoXDs";

    descriptions.appendChild(graphIcon);
    factionWarList.appendChild(descriptions);
    documentMock.body.appendChild(factionWarList);

    // Mock MutationObserver as it is used inside observeElement
    const observeMock = vi.fn();
    const disconnectMock = vi.fn();
    global.MutationObserver = class {
      observe = observeMock;
      disconnect = disconnectMock;
    } as any;

    // 2. Execute feature's run logic and wait for async ticks
    WarMonitorFeature.run();

    // Wait for the Microtask/Macrotask queue to clear
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Verify checkbox is injected
    const checkbox = documentMock.getElementById(
      "twse-war-sort-checkbox",
    ) as any;
    expect(checkbox).not.toBeNull();

    // Verify element position (it is injected before graphIcon)
    const toggleContainer = checkbox?.closest(".twse-sort-toggle-container");
    expect(toggleContainer?.parentNode?.children[0]).toBe(toggleContainer);
    expect(toggleContainer?.parentNode?.children[1]).toBe(graphIcon);

    // 3. Test changing checkbox state updates configuration
    if (checkbox) {
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event("change"));
      expect(twseconfig.war_sorting).toBe(false);

      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change"));
      expect(twseconfig.war_sorting).toBe(true);
    }
  });

  it("should inject copy buttons on player name columns and support standard/Torn PDA clipboard", async () => {
    // 1. Setup mock faction war DOM layout
    const factionWarList = new MockElement("div");
    factionWarList.id = "faction_war_list_id";

    const descriptions = new MockElement("div");
    descriptions.className = "descriptions faction-war";

    const ul = new MockElement("ul");
    ul.className = "members-list";

    const li = new MockElement("li");
    li.className = "enemy";

    const memberCol = new MockElement("div");
    memberCol.className = "member";

    const atag = new MockElement("a");
    atag.setAttribute("href", "/profiles.php?ID=12345");
    atag.textContent = "Astrobelt";

    const statusDiv = new MockElement("div");
    statusDiv.className = "status ok";

    memberCol.appendChild(atag);
    li.appendChild(memberCol);
    li.appendChild(statusDiv);
    ul.appendChild(li);
    descriptions.appendChild(ul);
    factionWarList.appendChild(descriptions);
    documentMock.body.appendChild(factionWarList);

    // 2. Set up navigator.clipboard and Torn PDA webview mocks
    const clipboardWriteMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(global.navigator, "clipboard", {
      value: {
        writeText: clipboardWriteMock,
      },
      writable: true,
      configurable: true,
    });

    const pdaCallHandlerMock = vi.fn().mockResolvedValue(undefined);
    (global.window as any).flutter_inappwebview = {
      callHandler: pdaCallHandlerMock,
    };

    // 3. Run feature
    WarMonitorFeature.run();

    // Wait for the Microtask/Macrotask queue to clear
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Verify copy button is injected inside the member column container
    const copyBtn = memberCol.querySelector(".twse-copy-btn");
    expect(copyBtn).not.toBeNull();

    // 4. Test copying with Torn PDA
    if (copyBtn) {
      await copyBtn.dispatchEvent(new Event("click"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      // It should prefer Torn PDA's flutter_inappwebview.callHandler first!
      expect(pdaCallHandlerMock).toHaveBeenCalledWith(
        "copyToClipboard",
        "Astrobelt [12345]",
      );
      expect(clipboardWriteMock).not.toHaveBeenCalled();
      expect(copyBtn.className).toContain("success");
    }

    // Reset mocks
    pdaCallHandlerMock.mockClear();
    clipboardWriteMock.mockClear();

    // 5. Test fallback to standard navigator.clipboard
    (global.window as any).flutter_inappwebview = undefined;
    if (copyBtn) {
      // Remove success class to test again
      copyBtn.className = "twse-copy-btn";
      await copyBtn.dispatchEvent(new Event("click"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(clipboardWriteMock).toHaveBeenCalledWith("Astrobelt [12345]");
      expect(copyBtn.className).toContain("success");
    }
  });
});
