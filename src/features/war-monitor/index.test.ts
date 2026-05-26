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
      toggle: (cls: string) => {
        if (this.className.split(" ").includes(cls)) {
          this.className = this.className
            .split(" ")
            .filter((c) => c !== cls)
            .join(" ");
          return false;
        }
        this.className = this.className ? `${this.className} ${cls}` : cls;
        return true;
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
      const match = selector.includes("factions.php")
        ? "/factions.php"
        : "/profiles.php";
      return this.findRecursive(
        (el) =>
          el.tagName === "A" &&
          (el.getAttribute("href")?.includes(match) ?? false),
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
      ID: 999,
      name: "Test Faction",
      tag: "TST",
      members: {},
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
    expect(bubble.innerHTML).toContain("[TST]");
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
      ID: 999,
      name: "Test Faction",
      tag: "TST",
      members: {},
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
      ID: 1234,
      name: "Test Faction",
      tag: "TF",
      members: {},
      chain: {
        current: 50,
        max: 100,
        timeout: 300,
        modifier: 2.5,
        cooldown: 120, // cooldown active!
        get end() {
          return Date.now() / 1000 + this.timeout;
        },
      },
    };

    const mockData2 = {
      ID: 1234,
      name: "Test Faction 2",
      tag: "TF2",
      members: {},
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
    // Cooldown is 120 seconds, so it formats to 2:00 or 1:59 depending on exact tick
    expect(bubble.innerHTML).toMatch(/1:59|2:00/);

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
});
