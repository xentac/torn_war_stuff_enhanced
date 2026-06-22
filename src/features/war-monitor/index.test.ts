import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

// GM_xmlhttpRequest is injected by the userscript manager at runtime.
// Return a no-op handle so TWSE Server calls don't throw in the test environment.
global.GM_xmlhttpRequest = vi.fn().mockReturnValue({ abort: vi.fn() }) as any;

// 2. Setup robust, lightweight MockElement DOM polyfill
class MockElement {
  public tagName: string;
  public id = "";
  public className = "";
  public textContent = "";
  public nodeType = 1; // Node.ELEMENT_NODE
  public isConnected = true;
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
      toggle: (cls: string, force?: boolean) => {
        const hasCls = this.className.split(" ").includes(cls);
        const shouldHave = force !== undefined ? force : !hasCls;
        if (shouldHave) {
          if (!hasCls) {
            this.className = this.className ? `${this.className} ${cls}` : cls;
          }
          return true;
        } else {
          this.className = this.className
            .split(" ")
            .filter((c) => c !== cls)
            .join(" ");
          return false;
        }
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

  remove() {
    if (this.parentNode) {
      const idx = this.parentNode.children.indexOf(this);
      if (idx !== -1) {
        this.parentNode.children.splice(idx, 1);
      }
      this.parentNode = null;
    }
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
    if (el.tagName === "FRAGMENT") {
      for (const child of [...el.children]) {
        this.appendChild(child);
      }
      el.children = [];
    } else {
      el.remove(); // detach from any current parent first, as real DOM does
      el.parentNode = this;
      this.children.push(el);
    }
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
      const match = selector.includes("factions.php")
        ? "/factions.php"
        : "/profiles.php";
      return this.findRecursive(
        (el) =>
          el.tagName === "A" &&
          (el.getAttribute("href")?.includes(match) ?? false),
      );
    }
    // Handle "tag.class" compound selectors (e.g. "div.status", "ul.members-list")
    const dotIdx = selector.indexOf(".");
    if (dotIdx > 0) {
      const tag = selector.slice(0, dotIdx).toUpperCase();
      const cls = selector.slice(dotIdx + 1);
      return this.findRecursive(
        (el) => el.tagName === tag && el.className.includes(cls),
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

  removeEventListener(event: string, cb: (...args: any[]) => any) {
    const list = this.listeners[event];
    if (list) {
      this.listeners[event] = list.filter((item) => item !== cb);
    }
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

  private _innerHTML = "";
  get innerHTML() {
    if (this._innerHTML.includes("twse-chain-body")) {
      const body = this.children.find((c) => c.className === "twse-chain-body");
      if (body) {
        return this._innerHTML.replace(
          '<div class="twse-chain-body"></div>',
          `<div class="twse-chain-body">${body.innerHTML}</div>`,
        );
      }
    }
    return this._innerHTML;
  }
  set innerHTML(html: string) {
    this._innerHTML = html;
    // Clear previous dynamic children to prevent duplicates on redraws
    this.children = this.children.filter(
      (c) => c.id === "twse-war-sort-checkbox",
    );

    // Basic parser for our specific template injection
    if (html.includes("twse-war-sort-checkbox")) {
      const checkbox = new MockElement("input");
      checkbox.id = "twse-war-sort-checkbox";
      checkbox.setAttribute("type", "checkbox");
      this.appendChild(checkbox);
    }

    if (html.includes("minimize-btn")) {
      const button = new MockElement("button");
      button.className = "twse-chain-toggle-btn minimize-btn";
      this.appendChild(button);
    }

    if (html.includes("expand-btn")) {
      const button = new MockElement("button");
      button.className = "twse-chain-toggle-btn expand-btn";
      this.appendChild(button);
    }

    if (html.includes("twse-chain-body")) {
      const body = new MockElement("div");
      body.className = "twse-chain-body";
      this.appendChild(body);
    }

    // Fallback parser for transitional/older elements
    if (
      html.includes("twse-chain-toggle-btn") &&
      !html.includes("minimize-btn") &&
      !html.includes("expand-btn")
    ) {
      const button = new MockElement("button");
      button.className = html.includes("twse-chain-toggle-btn minimized")
        ? "twse-chain-toggle-btn minimized"
        : "twse-chain-toggle-btn";
      this.appendChild(button);
    }
  }
}

const documentListeners = new Map<string, Array<(e: any) => void>>();
const documentMock = {
  body: new MockElement("body"),
  hidden: false,
  hasFocus: () => false,
  createElement(tag: string) {
    return new MockElement(tag);
  },
  createDocumentFragment() {
    return new MockElement("fragment");
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
  addEventListener: (event: string, callback: (e: any) => void) => {
    if (!documentListeners.has(event)) {
      documentListeners.set(event, []);
    }
    documentListeners.get(event)!.push(callback);
  },
  removeEventListener: (event: string, callback: (e: any) => void) => {
    const list = documentListeners.get(event);
    if (list) {
      documentListeners.set(
        event,
        list.filter((cb) => cb !== callback),
      );
    }
  },
  dispatchEvent: (event: any) => {
    const list = documentListeners.get(event.type);
    if (list) {
      for (const cb of list) {
        cb(event);
      }
    }
    return true;
  },
};

global.document = documentMock as any;
const windowListeners = new Map<string, Array<(e: any) => void>>();
global.window = {
  location: { href: "factions.php" },
  innerWidth: 800,
  innerHeight: 600,
  addEventListener: (event: string, callback: (e: any) => void) => {
    if (!windowListeners.has(event)) {
      windowListeners.set(event, []);
    }
    windowListeners.get(event)!.push(callback);
  },
  removeEventListener: (event: string, callback: (e: any) => void) => {
    const list = windowListeners.get(event);
    if (list) {
      windowListeners.set(
        event,
        list.filter((cb) => cb !== callback),
      );
    }
  },
  dispatchEvent: (event: Event) => {
    const list = windowListeners.get(event.type);
    if (list) {
      for (const cb of list) {
        cb(event);
      }
    }
    return true;
  },
  getComputedStyle: () => ({ top: "10px" }) as any,
  getSelection: () => ({ removeAllRanges: () => {} }),
} as any;

function NodeConstructor() {}
(NodeConstructor as any).ELEMENT_NODE = 1;
global.Node = NodeConstructor as any;

// 3. Import dynamic modules
const { twseconfig } = await import("@utils/config");
const { default: WarMonitorFeature } = await import("./index");

describe("WarMonitorFeature Sorting Config", () => {
  beforeEach(() => {
    localStorage.clear();
    documentMock.body = new MockElement("body");
    twseconfig.war_sorting = true;
    // Reset window.location
    global.window.location.href = "factions.php";
    global.window.location.hash = "#/war/123";
  });

  afterEach(async () => {
    // Restore default intervals
    WarMonitorFeature.intervals.poll = 10_000;
    WarMonitorFeature.intervals.watch = 500;
    WarMonitorFeature.intervals.minTimeBetweenRequests = 10_000;
    WarMonitorFeature.intervals.unexpectedHighlight = 10_000;

    // Restore real timers first to ensure setTimeout/promises in afterEach can resolve
    vi.useRealTimers();
    // Navigate away to trigger stopMonitor() and clean up all intervals, observers, and listeners
    global.window.location.hash = "#/tab=controls";
    global.window.dispatchEvent(new Event("popstate"));
    // Wait for the setTimeout(..., 0) inside on_navigation to execute
    await new Promise((resolve) => setTimeout(resolve, 10));
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
    atag.setAttribute("href", "/profiles.php?XID=12345");
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
    if (!global.navigator) {
      global.navigator = {} as any;
    }
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

  it("should copy only name and ID, excluding FF Scouter's injected estimate value", async () => {
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

    // FF Scouter nests the estimate bubble *inside* the profile anchor here,
    // alongside the visible name span. Torn still sets aria-label cleanly.
    const atag = new MockElement("a");
    atag.setAttribute("href", "/profiles.php?XID=347472");
    atag.setAttribute("aria-label", "View profile of Asprin50");
    const honorTextWrap = new MockElement("div");
    honorTextWrap.className = "honor-text-wrap honorContainer ffsv3-gauge";
    const honorName = new MockElement("span");
    honorName.className = "honor-text";
    honorName.textContent = "Asprin50";
    const estimateBubble = new MockElement("div");
    estimateBubble.className = "ffsv3-bubble";
    estimateBubble.textContent = "13.68";
    honorTextWrap.appendChild(honorName);
    honorTextWrap.appendChild(estimateBubble);
    atag.appendChild(honorTextWrap);
    // textContent of the whole anchor now includes the estimate, mirroring
    // the real FF Scouter DOM: "Asprin5013.68"

    const statusDiv = new MockElement("div");
    statusDiv.className = "status ok";

    memberCol.appendChild(atag);
    li.appendChild(memberCol);
    li.appendChild(statusDiv);
    ul.appendChild(li);
    descriptions.appendChild(ul);
    factionWarList.appendChild(descriptions);
    documentMock.body.appendChild(factionWarList);

    // 2. Set up navigator.clipboard mock
    const clipboardWriteMock = vi.fn().mockResolvedValue(undefined);
    if (!global.navigator) {
      global.navigator = {} as any;
    }
    Object.defineProperty(global.navigator, "clipboard", {
      value: {
        writeText: clipboardWriteMock,
      },
      writable: true,
      configurable: true,
    });
    (global.window as any).flutter_inappwebview = undefined;

    // 3. Run feature
    WarMonitorFeature.run();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const copyBtn = memberCol.querySelector(".twse-copy-btn");
    expect(copyBtn).not.toBeNull();

    if (copyBtn) {
      await copyBtn.dispatchEvent(new Event("click"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(clipboardWriteMock).toHaveBeenCalledWith("Asprin50 [347472]");
    }
  });

  it("should create floating bubble and update chain status when active chains are fetched", async () => {
    const { tornApi } = await import("@utils/api");
    const { twseconfig } = await import("@utils/config");

    twseconfig.apiKey = "1234567890123456"; // 16 chars

    const mockChainData = {
      current: 42,
      max: 100,
      timeout: 120, // 2 minutes remaining relative
      modifier: 1.5,
      cooldown: 0,
      get end() {
        return Date.now() / 1000 + this.timeout;
      },
    };

    const spy = vi.spyOn(tornApi, "fetchFactionData").mockResolvedValue({
      members: [],
      chain: mockChainData,
    });

    // 1. Setup mock faction war DOM layout
    const factionWarList = new MockElement("div");
    factionWarList.id = "faction_war_list_id";

    const descriptions = new MockElement("div");
    descriptions.className = "descriptions faction-war";

    const ul = new MockElement("ul");
    ul.className = "members-list";
    const atag = new MockElement("a");
    atag.setAttribute("href", "/factions.php?ID=999");
    ul.appendChild(atag);

    descriptions.appendChild(ul);
    factionWarList.appendChild(descriptions);
    documentMock.body.appendChild(factionWarList);

    // Mock MutationObserver
    const observeMock = vi.fn();
    const disconnectMock = vi.fn();
    global.MutationObserver = class {
      observe = observeMock;
      disconnect = disconnectMock;
    } as any;

    vi.useFakeTimers();

    // 2. Run feature
    WarMonitorFeature.run();

    // Advance to trigger initial updates
    await vi.advanceTimersByTimeAsync(100);

    const bubble = documentMock.getElementById("twse-chain-bubble") as any;
    expect(bubble).not.toBeNull();

    // Advance to trigger the 500ms watch tick
    await vi.advanceTimersByTimeAsync(500);

    expect(spy).toHaveBeenCalledWith("999");
    expect(bubble.innerHTML).toContain("42/100");
    expect(bubble.innerHTML).toContain("1.50x");
    expect(bubble.innerHTML).toMatch(/1:59|2:00/);
    expect(bubble.className).not.toContain("hidden");

    // Test negative countdown scenario (expired chain before next poll)
    mockChainData.timeout = 2;
    await vi.advanceTimersByTimeAsync(10000); // trigger poll with timeout: 2

    // Now advance 7 seconds so the countdown goes below zero client-side before the next poll
    await vi.advanceTimersByTimeAsync(7000);

    expect(bubble.innerHTML).toMatch(/-0:04|-0:05/);

    vi.useRealTimers();
    spy.mockRestore();
  });

  it("should persist and recover bubble position and clamp to viewport limits on resize", async () => {
    const { twseconfig } = await import("@utils/config");

    // 1. Setup mock configs
    twseconfig.bubble_position = { left: 400, top: 300 };

    // Setup viewport globals
    const originalInnerWidth = global.window.innerWidth;
    const originalInnerHeight = global.window.innerHeight;
    global.window.innerWidth = 800;
    global.window.innerHeight = 600;

    // Setup mock faction war DOM layout
    const factionWarList = new MockElement("div");
    factionWarList.id = "faction_war_list_id";

    const descriptions = new MockElement("div");
    descriptions.className = "descriptions faction-war";

    factionWarList.appendChild(descriptions);
    documentMock.body.appendChild(factionWarList);

    // Mock MutationObserver
    const observeMock = vi.fn();
    const disconnectMock = vi.fn();
    global.MutationObserver = class {
      observe = observeMock;
      disconnect = disconnectMock;
    } as any;

    vi.useFakeTimers();

    // 2. Run feature
    WarMonitorFeature.run();

    // Advance to trigger initial updates
    await vi.advanceTimersByTimeAsync(100);

    const bubble = documentMock.getElementById("twse-chain-bubble") as any;
    expect(bubble).not.toBeNull();

    // Verify recovery of position
    expect(bubble.style.left).toBe("400px");
    expect(bubble.style.top).toBe("300px");

    // Simulate window resize to a smaller size (e.g. 300x200) where the position (400, 300) would be offscreen
    global.window.innerWidth = 300;
    global.window.innerHeight = 200;

    // Trigger window resize event
    global.window.dispatchEvent(new Event("resize"));

    // The clamping should bring it within viewport (max left = 300 - 170 = 130px, max top = 200 - 60 = 140px)
    expect(parseFloat(bubble.style.left)).toBeLessThanOrEqual(130);
    expect(parseFloat(bubble.style.top)).toBeLessThanOrEqual(140);

    // Clean up
    twseconfig.bubble_position = null;
    global.window.innerWidth = originalInnerWidth;
    global.window.innerHeight = originalInnerHeight;
  });

  it("should save position on drag", async () => {
    const { tornApi } = await import("@utils/api");
    const { twseconfig } = await import("@utils/config");
    twseconfig.apiKey = "1234567890123456";

    const spy = vi.spyOn(tornApi, "fetchFactionData").mockResolvedValue({
      members: [],
      chain: {
        current: 42,
        max: 100,
        timeout: 120,
        modifier: 1.5,
        cooldown: 0,
        end: Date.now() / 1000 + 120,
      },
    });

    const factionWarList = new MockElement("div");
    factionWarList.id = "faction_war_list_id";
    const descriptions = new MockElement("div");
    descriptions.className = "descriptions faction-war";

    const ul = new MockElement("ul");
    ul.className = "members-list";
    const atag = new MockElement("a");
    atag.setAttribute("href", "/factions.php?ID=999");
    ul.appendChild(atag);

    descriptions.appendChild(ul);
    factionWarList.appendChild(descriptions);
    documentMock.body.appendChild(factionWarList);

    // Mock MutationObserver
    global.MutationObserver = class {
      observe = () => {};
      disconnect = () => {};
    } as any;

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 60000);
    WarMonitorFeature.run();
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(10000); // Trigger updateStatuses polling interval
    await vi.advanceTimersByTimeAsync(500); // Trigger watch draw interval

    const bubble = documentMock.getElementById("twse-chain-bubble") as any;
    expect(bubble).not.toBeNull();

    // Simulate dragging (mousedown, mousemove by 20px, mouseup)
    // Dispatch mousedown
    bubble.dispatchEvent({
      type: "mousedown",
      clientX: 100,
      clientY: 100,
      cancelable: true,
      preventDefault: () => {},
    });

    // Dispatch mousemove
    documentMock.dispatchEvent({
      type: "mousemove",
      clientX: 120,
      clientY: 120,
      cancelable: true,
      preventDefault: () => {},
    });

    // Dispatch mouseup
    documentMock.dispatchEvent({
      type: "mouseup",
      clientX: 120,
      clientY: 120,
    });

    // Verify position was saved
    expect(twseconfig.bubble_position).toEqual({ left: 20, top: 20 });

    // Clean up
    vi.useRealTimers();
    spy.mockRestore();
  });

  it("should clean up drag listeners and state on touchcancel", async () => {
    const { tornApi } = await import("@utils/api");
    const { twseconfig } = await import("@utils/config");
    twseconfig.apiKey = "1234567890123456";

    const spy = vi.spyOn(tornApi, "fetchFactionData").mockResolvedValue({
      members: [],
      chain: {
        current: 42,
        max: 100,
        timeout: 120,
        modifier: 1.5,
        cooldown: 0,
        end: Date.now() / 1000 + 120,
      },
    });

    const factionWarList = new MockElement("div");
    factionWarList.id = "faction_war_list_id";
    const descriptions = new MockElement("div");
    descriptions.className = "descriptions faction-war";

    const ul = new MockElement("ul");
    ul.className = "members-list";
    const atag = new MockElement("a");
    atag.setAttribute("href", "/factions.php?ID=999");
    ul.appendChild(atag);

    descriptions.appendChild(ul);
    factionWarList.appendChild(descriptions);
    documentMock.body.appendChild(factionWarList);

    global.MutationObserver = class {
      observe = () => {};
      disconnect = () => {};
    } as any;

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 60000);
    WarMonitorFeature.run();
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(10000);
    await vi.advanceTimersByTimeAsync(500);

    const bubble = documentMock.getElementById("twse-chain-bubble") as any;
    expect(bubble).not.toBeNull();

    // Start drag with touchstart
    let preventDefaultCalled = false;
    bubble.dispatchEvent({
      type: "touchstart",
      touches: [{ clientX: 100, clientY: 100 }],
      cancelable: true,
      preventDefault: () => {
        preventDefaultCalled = true;
      },
    });

    expect(preventDefaultCalled).toBe(true);

    // Cancel the touch sequence with touchcancel on bubble
    bubble.dispatchEvent({
      type: "touchcancel",
    });

    // Reset bubble position manually to make sure any future move behaves correctly
    bubble.style.left = "0px";
    bubble.style.top = "0px";

    // Attempt to move - should NOT affect bubble position since listeners should be removed
    bubble.dispatchEvent({
      type: "touchmove",
      touches: [{ clientX: 150, clientY: 150 }],
      cancelable: true,
      preventDefault: () => {},
    });

    // Position shouldn't have changed to 150
    expect(bubble.style.left).toBe("0px");
    expect(bubble.style.top).toBe("0px");

    // Clean up
    vi.useRealTimers();
    spy.mockRestore();
  });

  it("should render cooldown and non-existent chain states correctly", async () => {
    const { twseconfig } = await import("@utils/config");

    const factionWarList = new MockElement("div");
    factionWarList.id = "faction_war_list_id";
    const descriptions = new MockElement("div");
    descriptions.className = "descriptions faction-war";

    // Setup members-list so getFactionIds() parses the ID correctly
    const ul = new MockElement("ul");
    ul.className = "members-list";
    const atag = new MockElement("a");
    atag.setAttribute("href", "/factions.php?ID=1234");
    ul.appendChild(atag);
    descriptions.appendChild(ul);

    factionWarList.appendChild(descriptions);
    documentMock.body.appendChild(factionWarList);

    // Mock MutationObserver
    global.MutationObserver = class {
      observe = () => {};
      disconnect = () => {};
    } as any;

    const { tornApi } = await import("@utils/api");

    // Mock Faction Data responses
    const mockData1 = {
      members: [],
      chain: {
        current: 50,
        max: 100,
        timeout: 300,
        modifier: 2.5,
        // v2: Unix timestamp when cooldown ends (~2 minutes from now)
        cooldown: Math.floor(Date.now() / 1000) + 120,
        get end() {
          return Date.now() / 1000 + this.timeout;
        },
      },
    };

    const mockData2 = {
      members: [],
      chain: {
        current: 0,
        max: 10,
        timeout: 0, // non-existent chain!
        modifier: 1.0,
        cooldown: 0,
        get end() {
          return Date.now() / 1000 + this.timeout;
        },
      },
    };

    const spy = vi
      .spyOn(tornApi, "fetchFactionData")
      .mockResolvedValue(mockData1 as any);

    vi.useFakeTimers();
    twseconfig.apiKey = "1234567890123456";

    // Setup active war boxes
    const warBox1 = new MockElement("div");
    warBox1.className = "faction-warbox";
    const title1 = new MockElement("div");
    title1.className = "title";
    const a1 = new MockElement("a");
    a1.setAttribute("href", "factions.php?step=profile&ID=1234");
    title1.appendChild(a1);
    warBox1.appendChild(title1);
    documentMock.body.appendChild(warBox1);

    WarMonitorFeature.run();

    // Advance to trigger fetching and updates
    await vi.advanceTimersByTimeAsync(100);

    const bubble = documentMock.getElementById("twse-chain-bubble") as any;
    expect(bubble).not.toBeNull();

    // Advance to trigger the 500ms watch interval which calls updateChainBubble()
    await vi.advanceTimersByTimeAsync(500);

    // Verify cooldown (broken) chain rendering
    expect(bubble.innerHTML).toContain("twse-chain-count cooldown");
    expect(bubble.innerHTML).toContain("twse-chain-timer cooldown");
    // Cooldown is ~120 seconds; allow 1:58–2:00 to tolerate float rounding + timer advance
    expect(bubble.innerHTML).toMatch(/1:5[89]|2:00/);

    // Now switch mock to non-existent chain
    spy.mockRestore();
    const spy2 = vi
      .spyOn(tornApi, "fetchFactionData")
      .mockResolvedValue(mockData2 as any);

    // Advance to trigger next poll (10 seconds)
    await vi.advanceTimersByTimeAsync(10000);

    // Verify inactive/non-existent chain rendering
    expect(bubble.innerHTML).not.toContain("twse-chain-count cooldown");
    expect(bubble.innerHTML).not.toContain("twse-chain-timer cooldown");
    expect(bubble.innerHTML).toContain("okay"); // standard okay class
    expect(bubble.innerHTML).toContain("-:--");

    spy2.mockRestore();
    vi.useRealTimers();
  });

  describe("Settings Config Toggles Integration", () => {
    beforeEach(() => {
      localStorage.clear();
      documentMock.body = new MockElement("body");
      twseconfig.bubble_enabled = true;
      twseconfig.copy_button_enabled = true;

      // Minimal DOM so waitForElement("#faction_war_list_id") resolves
      // immediately, letting startMonitor() reach its stopMonitor
      // assignment — required for the outer afterEach's navigate-away
      // cleanup to actually remove this test's listeners (focus/blur
      // among them, registered unconditionally per ADR-0007).
      const factionWarList = new MockElement("div");
      factionWarList.id = "faction_war_list_id";
      documentMock.body.appendChild(factionWarList);

      global.MutationObserver = class {
        observe = vi.fn();
        disconnect = vi.fn();
      } as any;
    });

    it("should toggle appropriate body classes when configuration is changed", async () => {
      // 1. Run the feature
      WarMonitorFeature.run();

      // Wait for Microtask/Macrotask queue to clear
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Initial state: default true meaning no disabled class
      expect(documentMock.body.className).not.toContain("twse-bubble-disabled");
      expect(documentMock.body.className).not.toContain("twse-copy-disabled");

      // Toggle configurations
      twseconfig.bubble_enabled = false;
      twseconfig.copy_button_enabled = false;

      // Dispatch event to simulate panel saving/config updated
      window.dispatchEvent(new Event("twse-config-updated"));

      // Verify that classes are correctly updated
      expect(documentMock.body.className).toContain("twse-bubble-disabled");
      expect(documentMock.body.className).toContain("twse-copy-disabled");

      // Toggle them back
      twseconfig.bubble_enabled = true;
      twseconfig.copy_button_enabled = true;
      window.dispatchEvent(new Event("twse-config-updated"));

      expect(documentMock.body.className).not.toContain("twse-bubble-disabled");
      expect(documentMock.body.className).not.toContain("twse-copy-disabled");
    });

    it("should support purging caches when twse-clear-cache event is dispatched", async () => {
      const { factionCache } = await import("@utils/cache");

      // Run the feature
      WarMonitorFeature.run();

      // Wait for Microtask/Macrotask queue to clear
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Dispatch clear cache
      const clearSpy = vi.spyOn(factionCache, "clearAll");
      window.dispatchEvent(new Event("twse-clear-cache"));

      expect(clearSpy).toHaveBeenCalled();
      clearSpy.mockRestore();
    });
  });

  describe("Window Focus Gating (ADR-0007)", () => {
    beforeEach(() => {
      localStorage.clear();
      documentMock.body = new MockElement("body");
      documentMock.documentElement = new MockElement("html");
      documentMock.hasFocus = () => true;
      documentMock.hidden = false;
      (global.window as any).flutter_inappwebview = undefined;

      // Minimal DOM so waitForElement("#faction_war_list_id") resolves
      // immediately, letting startMonitor() reach its stopMonitor
      // assignment — required for the outer afterEach's navigate-away
      // cleanup to actually remove this test's listeners.
      const factionWarList = new MockElement("div");
      factionWarList.id = "faction_war_list_id";
      documentMock.body.appendChild(factionWarList);

      global.MutationObserver = class {
        observe = vi.fn();
        disconnect = vi.fn();
      } as any;
    });

    it("starts focused and toggles the class on window blur/focus", async () => {
      WarMonitorFeature.run();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(documentMock.documentElement.className).toContain(
        "twse-window-focused",
      );

      global.window.dispatchEvent(new Event("blur"));
      expect(documentMock.documentElement.className).not.toContain(
        "twse-window-focused",
      );

      global.window.dispatchEvent(new Event("focus"));
      expect(documentMock.documentElement.className).toContain(
        "twse-window-focused",
      );
    });

    it("starts unfocused when document.hasFocus() is false at startup", async () => {
      documentMock.hasFocus = () => false;

      WarMonitorFeature.run();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(documentMock.documentElement.className).not.toContain(
        "twse-window-focused",
      );
    });

    it("uses tab visibility instead of focus/blur on Torn PDA", async () => {
      (global.window as any).flutter_inappwebview = {
        callHandler: vi.fn(),
      };
      documentMock.hidden = false;

      WarMonitorFeature.run();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(documentMock.documentElement.className).toContain(
        "twse-window-focused",
      );

      // PDA ignores focus/blur entirely — its events are stuck until tap.
      global.window.dispatchEvent(new Event("blur"));
      expect(documentMock.documentElement.className).toContain(
        "twse-window-focused",
      );

      // visibilitychange drives the class instead, on PDA.
      documentMock.hidden = true;
      documentMock.dispatchEvent({ type: "visibilitychange" });
      expect(documentMock.documentElement.className).not.toContain(
        "twse-window-focused",
      );

      documentMock.hidden = false;
      documentMock.dispatchEvent({ type: "visibilitychange" });
      expect(documentMock.documentElement.className).toContain(
        "twse-window-focused",
      );
    });
  });

  describe("War Monitor Wiring — Session State Persistence and Sort Integration", () => {
    const buildWarDOM = (
      members: { id: string; statusClass: string; statusText: string }[],
    ) => {
      const factionWarList = new MockElement("div");
      factionWarList.id = "faction_war_list_id";

      const descriptions = new MockElement("div");
      descriptions.className = "descriptions faction-war";

      const ul = new MockElement("ul");
      ul.className = "members-list";

      // Faction anchor for getFactionIds()
      const factionAnchor = new MockElement("a");
      factionAnchor.setAttribute("href", "/factions.php?ID=999");
      ul.appendChild(factionAnchor);

      for (const m of members) {
        const li = new MockElement("li");
        li.className = "enemy";

        const memberDiv = new MockElement("div");
        memberDiv.className = "member";

        const atag = new MockElement("a");
        atag.setAttribute("href", `/profiles.php?XID=${m.id}`);
        memberDiv.appendChild(atag);

        const statusDiv = new MockElement("div");
        statusDiv.className = `status ${m.statusClass}`;
        statusDiv.textContent = m.statusText;

        li.appendChild(memberDiv);
        li.appendChild(statusDiv);
        ul.appendChild(li);
      }

      descriptions.appendChild(ul);
      factionWarList.appendChild(descriptions);
      documentMock.body.appendChild(factionWarList);

      global.MutationObserver = class {
        observe = () => {};
        disconnect = () => {};
      } as any;
    };

    beforeEach(() => {
      localStorage.clear();
      documentMock.body = new MockElement("body");
      twseconfig.war_sorting = true;
      twseconfig.apiKey = "1234567890123456";
      global.window.location.href = "factions.php";
      global.window.location.hash = "#/war/123";
    });

    it("should clear unexpected flag and move to sortA=2 when DOM shows hospital class", async () => {
      const { tornApi } = await import("@utils/api");
      const futureUntil = Math.floor(Date.now() / 1000) + 300;

      // Start: DOM shows Okay, API says Hospital → unexpected transition
      buildWarDOM([{ id: "5", statusClass: "ok", statusText: "Okay" }]);

      const spy = vi.spyOn(tornApi, "fetchFactionData").mockResolvedValue({
        members: [
          {
            id: 5,
            name: "Eve",
            level: 10,
            last_action: { status: "Offline", timestamp: 12345 },
            status: {
              state: "Hospital",
              description: "In the hospital",
              until: futureUntil,
            },
          },
        ],
      });

      vi.useFakeTimers();
      WarMonitorFeature.run();
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(500);

      const ul = documentMock.body.querySelector("ul.members-list") as any;
      const li = ul?.children.find((c: any) =>
        c.className.includes("enemy"),
      ) as any;
      expect(li?.getAttribute("data-sortA")).toBe("0");
      expect(li?.getAttribute("data-twse-last-action-timestamp")).toBe("12345");

      // Simulate DOM updating to show hospital class (member re-hospitalized)
      const statusDiv = li?.children.find((c: any) =>
        c.className.includes("status"),
      ) as any;
      statusDiv.className = "status hospital";

      await vi.advanceTimersByTimeAsync(500);

      // Flag cleared, now sortA=2 (hospital bucket)
      expect(li?.getAttribute("data-sortA")).toBe("2");
      expect(li?.getAttribute("data-unexpected-at")).toBe("0");

      spy.mockRestore();
    });

    it("should sort Tier A members newest-first and Tier B members oldest-first", async () => {
      const { tornApi } = await import("@utils/api");

      // Two members: both start Okay with no unexpected flags (Tier B)
      buildWarDOM([
        { id: "10", statusClass: "ok", statusText: "Okay" },
        { id: "11", statusClass: "ok", statusText: "Okay" },
      ]);

      const spy = vi.spyOn(tornApi, "fetchFactionData").mockResolvedValue({
        members: [
          {
            id: 10,
            name: "Alice",
            level: 10,
            last_action: { status: "", timestamp: 0 },
            status: {
              state: "Okay",
              description: "Okay",
              until: 0,
            },
          },
          {
            id: 11,
            name: "Bob",
            level: 10,
            last_action: { status: "", timestamp: 0 },
            status: {
              state: "Okay",
              description: "Okay",
              until: 0,
            },
          },
        ],
      });

      vi.useFakeTimers();
      WarMonitorFeature.run();
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(500);

      const ul = documentMock.body.querySelector("ul.members-list") as any;
      const lis = ul?.children.filter((c: any) =>
        c.className.includes("enemy"),
      ) as any[];

      // Tier B tiebreaker: equal okay-since → player_id ascending, so member 10 sorts before 11
      expect(
        lis[0]?.querySelector("a[href^='/profiles.php']")?.getAttribute("href"),
      ).toContain("ID=10");
      expect(
        lis[1]?.querySelector("a[href^='/profiles.php']")?.getAttribute("href"),
      ).toContain("ID=11");

      spy.mockRestore();
    });

    it("should force a sort on the tick after FF Scouter's active filter clears", async () => {
      const { tornApi } = await import("@utils/api");

      // DOM order is reversed (31 before 30); a completed Tier B sort
      // (player_id ascending) would flip them to 30, 31.
      buildWarDOM([
        { id: "31", statusClass: "ok", statusText: "Okay" },
        { id: "30", statusClass: "ok", statusText: "Okay" },
      ]);

      const ul = documentMock.body.querySelector("ul.members-list") as any;
      ul?.setAttribute("data-ffscouter-active-filter", "true");

      const spy = vi.spyOn(tornApi, "fetchFactionData").mockResolvedValue({
        members: [
          {
            id: 31,
            name: "Carol",
            level: 10,
            last_action: { status: "", timestamp: 0 },
            status: { state: "Okay", description: "Okay", until: 0 },
          },
          {
            id: 30,
            name: "Dave",
            level: 10,
            last_action: { status: "", timestamp: 0 },
            status: { state: "Okay", description: "Okay", until: 0 },
          },
        ],
      });

      const idOrder = () => {
        const lis = ul?.children.filter((c: any) =>
          c.className.includes("enemy"),
        ) as any[];
        return lis.map(
          (li) =>
            li
              .querySelector("a[href^='/profiles.php']")
              ?.getAttribute("href")
              ?.match(/ID=(\d+)/)?.[1],
        );
      };

      vi.useFakeTimers();
      WarMonitorFeature.run();
      await vi.advanceTimersByTimeAsync(100); // initial poll
      await vi.advanceTimersByTimeAsync(500); // tick 1: sort deferred by FF Scouter

      expect(idOrder()).toEqual(["31", "30"]);

      // FF Scouter deactivates its filter.
      ul?.setAttribute("data-ffscouter-active-filter", "false");

      await vi.advanceTimersByTimeAsync(500); // tick 2: detects the filter cleared
      expect(idOrder()).toEqual(["31", "30"]);

      await vi.advanceTimersByTimeAsync(500); // tick 3: forced sort runs
      expect(idOrder()).toEqual(["30", "31"]);

      spy.mockRestore();
    });
  });

  describe("Navigation Handling Lifecycle", () => {
    beforeEach(() => {
      localStorage.clear();
      documentMock.body = new MockElement("body");
      // Reset window.location
      global.window.location.href = "https://www.torn.com/factions.php";
      global.window.location.hash = "#/war/123";
    });

    it("should start monitor if shouldRunMonitor() matches initially", async () => {
      const factionWarList = new MockElement("div");
      factionWarList.id = "faction_war_list_id";
      documentMock.body.appendChild(factionWarList);

      WarMonitorFeature.run();

      await new Promise((resolve) => setTimeout(resolve, 0));

      const bubble = documentMock.getElementById("twse-chain-bubble");
      expect(bubble).not.toBeNull();
    });

    it("should clean up and remove bubble/checkbox when navigating away", async () => {
      const factionWarList = new MockElement("div");
      factionWarList.id = "faction_war_list_id";

      const descriptions = new MockElement("div");
      descriptions.className = "descriptions";
      const graphIcon = new MockElement("div");
      graphIcon.className = "right c-pointer graphIcon___aoXDs";
      descriptions.appendChild(graphIcon);
      factionWarList.appendChild(descriptions);
      documentMock.body.appendChild(factionWarList);

      WarMonitorFeature.run();

      await new Promise((resolve) => setTimeout(resolve, 0));

      // Bubble and sorting checkbox should be created
      expect(documentMock.getElementById("twse-chain-bubble")).not.toBeNull();
      expect(
        documentMock.getElementById("twse-war-sort-checkbox"),
      ).not.toBeNull();

      // Now, simulate navigating away to factions.php#/tab=controls
      global.window.location.hash = "#/tab=controls";

      // Dispatch popstate/hashchange to trigger on_navigation
      global.window.dispatchEvent(new Event("popstate"));
      global.window.dispatchEvent(new Event("hashchange"));

      // Advance timers or delay to let setTimeout(..., 0) run
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Bubble and sorting checkbox should be removed from DOM
      expect(documentMock.getElementById("twse-chain-bubble")).toBeNull();
      expect(documentMock.getElementById("twse-war-sort-checkbox")).toBeNull();
    });

    it("should restart monitor when navigating back to valid hash", async () => {
      const factionWarList = new MockElement("div");
      factionWarList.id = "faction_war_list_id";

      const descriptions = new MockElement("div");
      descriptions.className = "descriptions";
      const graphIcon = new MockElement("div");
      graphIcon.className = "right c-pointer graphIcon___aoXDs";
      descriptions.appendChild(graphIcon);
      factionWarList.appendChild(descriptions);
      documentMock.body.appendChild(factionWarList);

      WarMonitorFeature.run();

      await new Promise((resolve) => setTimeout(resolve, 0));

      // Navigate away
      global.window.location.hash = "#/tab=controls";
      global.window.dispatchEvent(new Event("popstate"));
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(documentMock.getElementById("twse-chain-bubble")).toBeNull();

      // Navigate back to factions.php#/war/123
      global.window.location.hash = "#/war/123";
      global.window.dispatchEvent(new Event("popstate"));
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Bubble and sorting checkbox should be re-created
      expect(documentMock.getElementById("twse-chain-bubble")).not.toBeNull();
      expect(
        documentMock.getElementById("twse-war-sort-checkbox"),
      ).not.toBeNull();
    });

    it("should clean up and remove bubble/checkbox when navigating to any tab hashes under #/tab=", async () => {
      const factionWarList = new MockElement("div");
      factionWarList.id = "faction_war_list_id";

      const descriptions = new MockElement("div");
      descriptions.className = "descriptions";
      const graphIcon = new MockElement("div");
      graphIcon.className = "right c-pointer graphIcon___aoXDs";
      descriptions.appendChild(graphIcon);
      factionWarList.appendChild(descriptions);
      documentMock.body.appendChild(factionWarList);

      const newlyExcludedHashes = [
        "#/tab=territory",
        "#/tab=info",
        "#/tab=rank",
        "#/tab=crimes",
        "#/tab=upgrades",
        "#/tab=armoury",
        "#/tab=controls",
      ];

      for (const targetHash of newlyExcludedHashes) {
        // Reset and start monitor
        global.window.location.hash = "#/war/123";
        WarMonitorFeature.run();
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(documentMock.getElementById("twse-chain-bubble")).not.toBeNull();
        expect(
          documentMock.getElementById("twse-war-sort-checkbox"),
        ).not.toBeNull();

        // Simulate navigating to the excluded tab hash
        global.window.location.hash = targetHash;
        global.window.dispatchEvent(new Event("popstate"));
        await new Promise((resolve) => setTimeout(resolve, 10));

        // State should be completely torn down
        expect(documentMock.getElementById("twse-chain-bubble")).toBeNull();
        expect(
          documentMock.getElementById("twse-war-sort-checkbox"),
        ).toBeNull();
      }
    });
  });
});
