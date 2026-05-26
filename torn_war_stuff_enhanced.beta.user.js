// ==UserScript==
// @name         Torn War Stuff Enhanced Beta
// @namespace    namespace-beta
// @version      2.0-beta5
// @author       xentac
// @description  Show travel status and hospital time and sort by hospital time on war page.
// @license      MIT
// @match        https://www.torn.com/factions.php*
// @connect      api.torn.com
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const n=new Set;const importCSS = async e=>{n.has(e)||(n.add(e),(d=>{const t=document.createElement("style");t.textContent=d,(document.head||document.documentElement).appendChild(t);})(e));};

  var LogLevel = ((LogLevel2) => {
    LogLevel2[LogLevel2["DEBUG"] = 0] = "DEBUG";
    LogLevel2[LogLevel2["INFO"] = 1] = "INFO";
    LogLevel2[LogLevel2["WARN"] = 2] = "WARN";
    LogLevel2[LogLevel2["ERROR"] = 3] = "ERROR";
    LogLevel2[LogLevel2["NONE"] = 4] = "NONE";
    return LogLevel2;
  })(LogLevel || {});
  class Logger {
prefix;
defaultLevel;
state;
isPDA = false;
colors = {
      debug: "#7f8c8d",
      info: "#3498db",
      warn: "#f39c12",
      error: "#e74c3c"
    };
constructor(prefix = "", defaultLevel = 1, state = {}) {
      this.prefix = prefix;
      this.defaultLevel = defaultLevel;
      this.state = state;
      this.detectPDA();
    }
detectPDA() {
      if (typeof window !== "undefined") {
        if (window.flutter_inappwebview) {
          this.isPDA = true;
        }
        window.addEventListener("flutterInAppWebViewPlatformReady", () => {
          window.flutter_inappwebview.callHandler("isTornPDA").then((response) => {
            if (response?.isTornPDA) {
              this.isPDA = true;
            }
          }).catch(() => {
          });
        });
      }
    }
setLevel(level) {
      this.state.explicitLevel = level;
    }
getLevel() {
      return this.state.explicitLevel !== void 0 ? this.state.explicitLevel : this.defaultLevel;
    }
debug(...args) {
      if (this.getLevel() <= 0) {
        if (this.isPDA) {
          console.log(`${this.formatPrefix("DEBUG")}`, ...this.formatArgs(args));
        } else {
          console.log(
            `%c${this.formatPrefix("DEBUG")}`,
            `color: ${this.colors.debug}; font-weight: bold`,
            ...args
          );
        }
      }
    }
info(...args) {
      if (this.getLevel() <= 1) {
        if (this.isPDA) {
          console.info(`${this.formatPrefix("INFO")}`, ...this.formatArgs(args));
        } else {
          console.info(
            `%c${this.formatPrefix("INFO")}`,
            `color: ${this.colors.info}; font-weight: bold`,
            ...args
          );
        }
      }
    }
warn(...args) {
      if (this.getLevel() <= 2) {
        if (this.isPDA) {
          console.warn(`${this.formatPrefix("WARN")}`, ...this.formatArgs(args));
        } else {
          console.warn(
            `%c${this.formatPrefix("WARN")}`,
            `color: ${this.colors.warn}; font-weight: bold`,
            ...args
          );
        }
      }
    }
error(...args) {
      if (this.getLevel() <= 3) {
        if (this.isPDA) {
          console.error(
            `${this.formatPrefix("ERROR")}`,
            ...this.formatArgs(args)
          );
        } else {
          console.error(
            `%c${this.formatPrefix("ERROR")}`,
            `color: ${this.colors.error}; font-weight: bold`,
            ...args
          );
        }
      }
    }
group(label, collapsed = false) {
      if (this.getLevel() < 4) {
        if (collapsed) {
          console.groupCollapsed(this.formatPrefix(""), label);
        } else {
          console.group(this.formatPrefix(""), label);
        }
      }
    }
groupEnd() {
      if (this.getLevel() < 4) {
        console.groupEnd();
      }
    }
child(subPrefix) {
      const childPrefix = this.prefix ? `${this.prefix}:${subPrefix}` : subPrefix;
      return new Logger(childPrefix, this.defaultLevel, this.state);
    }
formatPrefix(level) {
      const prefix = this.prefix ? `[${this.prefix}]` : "";
      return level ? `${prefix} - [${level}]: ` : `${prefix}: `;
    }
formatArgs(args) {
      return args.map((arg) => {
        if (typeof arg === "object" && arg !== null) {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return arg;
      });
    }
  }
  const logger = new Logger(
    "TWSE",
    1
);
  const log$6 = logger.child("storage");
  class Storage {
prefix;
constructor(prefix) {
      this.prefix = prefix;
    }
set(key, value, expireConfig) {
      try {
        const item = {
          value,
          expiration: expireConfig ? Date.now() + expireConfig.amount * (expireConfig.unit || 6e4) : null
        };
        localStorage.setItem(this.prefix + key, JSON.stringify(item));
      } catch (error) {
        log$6.error(`Error storing item '${key}':`, error);
      }
    }
get(key) {
      try {
        const itemStr = localStorage.getItem(this.prefix + key);
        if (!itemStr) {
          return null;
        }
        let item = null;
        try {
          item = JSON.parse(itemStr);
        } catch {
          item = null;
        }
        if (!item) {
          log$6.warn(`Key '${key}' has invalid JSON in it.`);
          this.remove(key);
          return null;
        }
        if (item.expiration && Date.now() > item.expiration) {
          this.remove(key);
          log$6.debug(`Key '${key}' has expired.`);
          return null;
        }
        return item.value;
      } catch (error) {
        log$6.error(`Error retrieving item '${key}':`, error);
        return null;
      }
    }
remove(key) {
      try {
        localStorage.removeItem(this.prefix + key);
      } catch (error) {
        log$6.error(`Error removing item '${key}':`, error);
      }
    }
has(key) {
      return this.get(key) !== null;
    }
clearAll() {
      try {
        Object.keys(localStorage).filter((key) => key.startsWith(this.prefix)).forEach((key) => {
          localStorage.removeItem(key);
        });
      } catch (error) {
        log$6.error("Error clearing storage:", error);
      }
    }
  }
  class Config {
    storage;
    legacyPrefix = "xentac-torn_war_stuff_enhanced-";
    constructor(prefix = "twse-config-") {
      this.storage = new Storage(prefix);
      logger.setLevel(this.debug_logs ? LogLevel.DEBUG : LogLevel.INFO);
    }
get apiKey() {
      const key = this.storage.get(
        "apikey"
);
      if (key) {
        return key;
      }
      const legacyKey = localStorage.getItem(`${this.legacyPrefix}apikey`);
      if (legacyKey) {
        return legacyKey;
      }
      return "";
    }
set apiKey(val) {
      this.storage.set("apikey", val);
      localStorage.setItem(`${this.legacyPrefix}apikey`, val);
    }
get debug_logs() {
      return this.storage.get(
        "debug_logs"
) ?? false;
    }
    set debug_logs(val) {
      this.storage.set("debug_logs", val);
      logger.setLevel(val ? LogLevel.DEBUG : LogLevel.INFO);
    }
get war_sorting() {
      return this.storage.get(
        "war_sorting"
) ?? true;
    }
    set war_sorting(val) {
      this.storage.set("war_sorting", val);
    }
get bubble_position() {
      return this.storage.get(
        "bubble_position"
) ?? null;
    }
    set bubble_position(val) {
      if (val === null) {
        this.storage.remove(
          "bubble_position"
);
      } else {
        this.storage.set("bubble_position", val);
      }
    }
get bubble_minimized() {
      return this.storage.get(
        "bubble_minimized"
) ?? false;
    }
    set bubble_minimized(val) {
      this.storage.set("bubble_minimized", val);
    }
reset() {
      this.storage.remove(
        "debug_logs"
);
      this.storage.remove(
        "war_sorting"
);
      this.storage.remove(
        "bubble_position"
);
      this.storage.remove(
        "bubble_minimized"
);
    }
  }
  const twseconfig = new Config();
  var StartTime = ((StartTime2) => {
    StartTime2[StartTime2["DocumentStart"] = 0] = "DocumentStart";
    StartTime2[StartTime2["DocumentBody"] = 1] = "DocumentBody";
    StartTime2[StartTime2["DocumentEnd"] = 2] = "DocumentEnd";
    return StartTime2;
  })(StartTime || {});
  const log$5 = logger.child("feature:key-manager");
  const KeyManagerFeature = {
    name: "Key Manager",
    description: "Allows the user to register their Torn API key via a Tampermonkey menu command",
    executionTime: StartTime.DocumentEnd,
    shouldRun() {
      return true;
    },
    run() {
      if (typeof GM_registerMenuCommand !== "undefined") {
        GM_registerMenuCommand("Torn War Stuff: Register Key", () => {
          const defaultPrompt = twseconfig.apiKey;
          const key = prompt("Please enter a Torn API Key:", defaultPrompt);
          if (key !== null) {
            const trimmedKey = key.trim();
            if (trimmedKey.length === 16 || trimmedKey === "") {
              twseconfig.apiKey = trimmedKey;
              log$5.info("Successfully updated API Key registration");
              alert("Torn API key registered successfully!");
            } else {
              alert("Invalid key! A Torn API key must be exactly 16 characters.");
            }
          }
        });
        log$5.debug("Tampermonkey menu command 'Register Key' initialized");
      } else {
        log$5.warn("GM_registerMenuCommand is not available in this context.");
      }
    }
  };
  const __vite_glob_0_0 = Object.freeze( Object.defineProperty({
    __proto__: null,
    default: KeyManagerFeature
  }, Symbol.toStringTag, { value: "Module" }));
  const log$4 = logger.child("api");
  class TornApiClient {
    baseUrl = "https://api.torn.com/faction/";
async fetchFactionData(factionId) {
      const tornpdakey = "###PDA-APIKEY###";
      let key = twseconfig.apiKey;
      if (!tornpdakey.startsWith("###PDA")) {
        key = tornpdakey;
      }
      if (!key || key.length !== 16) {
        log$4.warn("Torn API key is invalid or not set. Skipping API request.");
        return null;
      }
      const url = `${this.baseUrl}${factionId}?selections=basic,chain&key=${key}&comment=TornWarStuffEnhanced`;
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP Error status: ${response.status}`);
        }
        const data = await response.json();
        if (data.error) {
          log$4.error(
            `Torn API returned error code ${data.error.code}: ${data.error.error}`
          );
          return data;
        }
        return data;
      } catch (e) {
        log$4.error(
          `Network or parse error fetching faction ${factionId} data:`,
          e
        );
        return null;
      }
    }
isUnrecoverableError(errorCode) {
      const unrecoverable = [0, 1, 2, 3, 4, 6, 7, 10, 12, 13, 14, 16, 18, 21];
      return unrecoverable.includes(errorCode);
    }
isRateLimitError(errorCode) {
      const rateLimits = [5, 8, 9];
      return rateLimits.includes(errorCode);
    }
  }
  const tornApi = new TornApiClient();
  const log$3 = logger.child("cache");
  class FactionCache {
    prefix = "xentac-torn_war_stuff_enhanced-status-";
    ttlMs = 1e4;

get(factionId) {
      try {
        const key = `${this.prefix}${factionId}`;
        const cacheStr = localStorage.getItem(key);
        if (!cacheStr) {
          return null;
        }
        const parsed = JSON.parse(cacheStr);
        if (!parsed || typeof parsed.timestamp !== "number" || !parsed.status) {
          this.remove(factionId);
          return null;
        }
        const now = Date.now();
        if (now - parsed.timestamp > this.ttlMs) {
          this.remove(factionId);
          return null;
        }
        return parsed.status;
      } catch (e) {
        log$3.error(`Error reading cached status for faction ${factionId}:`, e);
        this.remove(factionId);
        return null;
      }
    }
set(factionId, status) {
      try {
        const key = `${this.prefix}${factionId}`;
        const cacheItem = {
          timestamp: Date.now(),
          status
        };
        localStorage.setItem(key, JSON.stringify(cacheItem));
      } catch (e) {
        log$3.error(`Error caching status for faction ${factionId}:`, e);
      }
    }
remove(factionId) {
      try {
        const key = `${this.prefix}${factionId}`;
        localStorage.removeItem(key);
      } catch (e) {
        log$3.error(`Error removing cached status for faction ${factionId}:`, e);
      }
    }
cleanExpired() {
      try {
        const now = Date.now();
        let cleanedCount = 0;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key || !key.startsWith(this.prefix)) {
            continue;
          }
          const value = localStorage.getItem(key);
          if (!value) {
            continue;
          }
          try {
            const parsed = JSON.parse(value);
            if (!parsed || now - parsed.timestamp > this.ttlMs) {
              localStorage.removeItem(key);
              cleanedCount++;
              i--;
            }
          } catch {
            localStorage.removeItem(key);
            cleanedCount++;
            i--;
          }
        }
        if (cleanedCount > 0) {
          log$3.info(`Cleaned ${cleanedCount} expired cached statuses`);
        }
      } catch (e) {
        log$3.error("Error sweeping expired cached statuses:", e);
      }
    }
  }
  const factionCache = new FactionCache();
  const log$2 = logger.child("dom");
  function waitForElement(selector, timeoutMs = 15e3) {
    return new Promise((resolve) => {
      const existing = document.querySelector(selector);
      if (existing) {
        return resolve(existing);
      }
      const observer = new MutationObserver((_, obs) => {
        const el = document.querySelector(selector);
        if (el) {
          obs.disconnect();
          resolve(el);
        }
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
      if (timeoutMs > 0) {
        setTimeout(() => {
          observer.disconnect();
          log$2.debug(`Timeout waiting for element selector: '${selector}'`);
          resolve(null);
        }, timeoutMs);
      }
    });
  }
  function observeElement(target, callback, options = { childList: true, subtree: true }) {
    const observer = new MutationObserver((mutations, obs) => {
      if (!target.isConnected) {
        cleanup();
        return;
      }
      callback(mutations, obs);
    });
    const intervalId = setInterval(() => {
      if (!target.isConnected) {
        cleanup();
      }
    }, 1e4);
    function cleanup() {
      clearInterval(intervalId);
      observer.disconnect();
    }
    const originalDisconnect = observer.disconnect.bind(observer);
    observer.disconnect = () => {
      clearInterval(intervalId);
      originalDisconnect();
    };
    observer.observe(target, options);
    return observer;
  }
  function getCurrentTimeSec() {
    const w = window;
    if (typeof w.getCurrentTimestamp === "function") {
      try {
        return w.getCurrentTimestamp() / 1e3;
      } catch (_e) {
      }
    }
    return Date.now() / 1e3;
  }
  function pad_with_zeros(n) {
    if (n < 10) {
      return `0${n}`;
    }
    return String(n);
  }
  function calc_delta(delta, include_seconds = true, pad_hour = true) {
    const s = Math.floor(delta % 60);
    const m = Math.floor(delta / 60 % 60);
    const h = Math.floor(delta / 60 / 60);
    const hour_minute = `${pad_hour ? pad_with_zeros(h) : h}:${pad_with_zeros(m)}`;
    return hour_minute + (include_seconds ? `:${pad_with_zeros(s)}` : "");
  }
  function formatChainTimeout(seconds) {
    const isNegative = seconds < 0;
    const absSeconds = Math.abs(seconds);
    const m = Math.floor(absSeconds / 60);
    const s = Math.floor(absSeconds % 60);
    return `${isNegative ? "-" : ""}${m}:${pad_with_zeros(s)}`;
  }
  function formatChainCooldown(seconds) {
    if (seconds <= 0) return "0:00";
    const s = Math.floor(seconds % 60);
    const m = Math.floor(seconds / 60 % 60);
    const h = Math.floor(seconds / 3600 % 24);
    const d = Math.floor(seconds / 86400);
    if (d > 0) return `${d}d${h}h`;
    if (h > 0) return `${h}h${m}m`;
    if (m >= 10) return `${m}m`;
    return `${m}:${pad_with_zeros(s)}`;
  }
  const DEST_TABLE = new Map([
    ["mexico", "MX"],
    ["cayman islands", "CI"],
    ["canada", "CA"],
    ["hawaii", "HI"],
    ["united kingdom", "UK"],
    ["argentina", "AR"],
    ["switzerland", "SW"],
    ["japan", "JP"],
    ["china", "CN"],
    ["uae", "UAE"],
    ["south africa", "SA"],
    ["torn", "TC"]
  ]);
  function shorten_destination(dest) {
    return DEST_TABLE.get(dest.toLowerCase().trim()) ?? dest;
  }
  const TRAVELING_REGEX = /Traveling from ([\S ]+) to ([\S ]+)/;
  function extract_destinations_from_description(description) {
    if (!description.startsWith("Traveling from")) {
      return null;
    }
    const match = TRAVELING_REGEX.exec(description);
    if (!match) {
      return null;
    }
    return {
      from: shorten_destination(match[1]),
      to: shorten_destination(match[2])
    };
  }
  const stylesCss = ".members-list li:has(div.status[data-twse-highlight=true]){background-color:#99eb99!important}.members-list li:has(div.status[data-twse-status-differs=true]){background-color:#c4974c!important}.members-list div.status[data-twse-traveling=true]:after{color:#696026!important}:root .dark-mode .members-list li:has(div.status[data-twse-highlight=true]){background-color:#446944!important}:root .dark-mode .members-list li:has(div.status[data-twse-status-differs=true]){background-color:#795315!important}:root .dark-mode .members-list div.status[data-twse-traveling=true]:after{color:#ffed76!important}.members-list div.status{position:relative!important;color:transparent!important}.members-list div.status:after{content:var(--twse-content);position:absolute;top:0;left:0;width:calc(100% - 10px);height:100%;background:inherit;display:flex;right:10px;justify-content:flex-end;align-items:center;white-space:nowrap!important}.members-list .ok.status:after{color:var(--user-status-green-color)}.members-list .not-ok.status:after{color:var(--user-status-red-color)}.members-list .abroad.status:after,.members-list .traveling.status:after{color:var(--user-status-blue-color)}.twse-sort-toggle-container{position:absolute;left:10px;display:inline-flex;align-items:center}.twse-sort-toggle-label{display:inline-flex;align-items:center;gap:6px;cursor:pointer;color:#999;font-size:13px;-webkit-user-select:none;user-select:none}.twse-sort-toggle-checkbox{cursor:pointer;margin:0;width:13px;height:13px}.members-list li .member{position:relative!important;display:flex!important;align-items:center}.twse-copy-btn{position:absolute;right:8px;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;justify-content:center;background:none;border:none;cursor:pointer;padding:4px;color:#888;transition:color .15s,background-color .15s,transform .1s;border-radius:4px;z-index:10}.twse-copy-btn:hover{color:#333;background-color:#0000000d}:root .dark-mode .twse-copy-btn:hover{color:#fff;background-color:#ffffff26}.twse-copy-btn:active{transform:translateY(-50%) scale(.9)}.twse-copy-btn.success{color:#494!important}:root .dark-mode .twse-copy-btn.success{color:#69eb69!important}.twse-chain-bubble{position:fixed;bottom:100px;right:20px;z-index:9999;background:#1e1e1ed9;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:6px 10px;box-shadow:0 8px 32px #0000005e;color:#e0e0e0;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:11px;line-height:1.5;display:flex;flex-direction:column;transition:opacity .3s ease,transform .3s ease;min-width:100px;pointer-events:auto;cursor:grab;user-select:none;-webkit-user-select:none}.twse-chain-bubble.hidden{opacity:0;transform:translateY(10px);pointer-events:none}.twse-chain-body{display:flex;flex-direction:column;gap:4px;width:100%}.twse-chain-tag,.twse-chain-mult{display:none}.twse-chain-row{display:flex;justify-content:space-between;align-items:center;gap:12px}.twse-chain-stats{display:flex;align-items:center;gap:6px;width:100%}.twse-chain-count{font-weight:600;color:#fff}.twse-chain-timer{margin-left:auto;font-family:monospace;font-weight:700;padding:2px 6px;border-radius:4px;background:#0000004d}.twse-chain-timer.okay{color:#69eb69}.twse-chain-timer.cooldown{color:#64b5f6;background:#64b5f626}.twse-chain-count.cooldown{color:#64b5f6}.twse-chain-timer.negative{color:#ff5252}.twse-chain-timer.urgent{color:#ff5252;background:#ff525226;animation:twse-pulse 1s infinite alternate}@keyframes twse-pulse{0%{box-shadow:0 0 2px #ff525266}to{box-shadow:0 0 8px #ff5252cc}}";
  importCSS(stylesCss);
  const log$1 = logger.child("feature:war-monitor");
  async function copyToClipboard(text) {
    if (typeof window !== "undefined" && window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
      try {
        await window.flutter_inappwebview.callHandler(
          "copyToClipboard",
          text
        );
        return true;
      } catch (err) {
        log$1.error("Failed to copy using Torn PDA callHandler", err);
      }
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (err) {
      log$1.error("Failed to copy using clipboard API", err);
    }
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);
      return success;
    } catch (err) {
      log$1.error("Failed to copy using fallback", err);
      return false;
    }
  }
  const TRAVELING = "data-twse-traveling";
  const HIGHLIGHT = "data-twse-highlight";
  const STATUS_DIFFERS = "data-twse-status-differs";
  const WarMonitorFeature = {
    name: "War Monitor",
    description: "Monitors active Faction wars, retrieves real-time member statuses, and decorates rows",
    executionTime: StartTime.DocumentEnd,
    shouldRun() {
      return window.location.href.includes("factions.php");
    },
    async run() {
      factionCache.cleanExpired();
      let running = true;
      let foundWar = false;
      let pageVisible = !document.hidden;
      let everSorted = false;
      let ffscouterSortingDeferred = false;
      const memberStatus = new Map();
      const memberLis = new Map();
      const deferredWrites = [];
      const deferredStyles = [];
      let lastRequestTime = 0;
      const minTimeBetweenRequestsMs = 1e4;
      const activeChains = new Map();
      let bubbleContainer = document.getElementById(
        "twse-chain-bubble"
      );
      if (!bubbleContainer) {
        bubbleContainer = document.createElement("div");
        bubbleContainer.id = "twse-chain-bubble";
        bubbleContainer.className = "twse-chain-bubble hidden";
        document.body.appendChild(bubbleContainer);
      }
      if (bubbleContainer && !bubbleContainer.querySelector(".twse-chain-body")) {
        bubbleContainer.innerHTML = `<div class="twse-chain-body"></div>`;
      }
      const getBubbleRect = () => {
        if (bubbleContainer && typeof bubbleContainer.getBoundingClientRect === "function") {
          const r = bubbleContainer.getBoundingClientRect();
          return {
            left: r.left ?? 0,
            top: r.top ?? 0,
            width: r.width || 170,
            height: r.height || 60
          };
        }
        return { left: 0, top: 0, width: 170, height: 60 };
      };
      const clampToScreen = () => {
        if (!bubbleContainer) return;
        const rect = getBubbleRect();
        const w = rect.width;
        const h = rect.height;
        const currentLeft = parseFloat(bubbleContainer.style.left);
        const currentTop = parseFloat(bubbleContainer.style.top);
        if (!Number.isNaN(currentLeft) && !Number.isNaN(currentTop)) {
          const maxLeft = window.innerWidth - w;
          const maxTop = window.innerHeight - h;
          bubbleContainer.style.left = `${Math.max(0, Math.min(currentLeft, maxLeft))}px`;
          bubbleContainer.style.top = `${Math.max(0, Math.min(currentTop, maxTop))}px`;
        }
      };
      window.addEventListener("resize", clampToScreen, { passive: true });
      if (bubbleContainer) {
        const savedPos = twseconfig.bubble_position;
        if (savedPos) {
          bubbleContainer.style.bottom = "auto";
          bubbleContainer.style.right = "auto";
          bubbleContainer.style.left = `${savedPos.left}px`;
          bubbleContainer.style.top = `${savedPos.top}px`;
          setTimeout(clampToScreen, 0);
        }
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let initialX = 0;
        let initialY = 0;
        const dragStart = (e) => {
          isDragging = true;
          const isTouch = e.type === "touchstart";
          const touchEvent = e;
          const mouseEvent = e;
          const clientX = isTouch && touchEvent.touches && touchEvent.touches.length > 0 ? touchEvent.touches[0].clientX : mouseEvent.clientX;
          const clientY = isTouch && touchEvent.touches && touchEvent.touches.length > 0 ? touchEvent.touches[0].clientY : mouseEvent.clientY;
          startX = clientX;
          startY = clientY;
          if (bubbleContainer) {
            const rect = getBubbleRect();
            initialX = rect.left;
            initialY = rect.top;
            bubbleContainer.style.transition = "none";
            bubbleContainer.style.cursor = "grabbing";
          }
          if (!isTouch && e.cancelable) {
            e.preventDefault();
          }
          window.getSelection()?.removeAllRanges();
          document.addEventListener("mousemove", dragMove);
          document.addEventListener("touchmove", dragMove, { passive: false });
          document.addEventListener("mouseup", dragEnd);
          document.addEventListener("touchend", dragEnd);
        };
        const dragMove = (e) => {
          if (!isDragging || !bubbleContainer) return;
          if (e.cancelable) {
            e.preventDefault();
          }
          const isTouch = e.type === "touchmove";
          const touchEvent = e;
          const mouseEvent = e;
          const clientX = isTouch && touchEvent.touches && touchEvent.touches.length > 0 ? touchEvent.touches[0].clientX : mouseEvent.clientX;
          const clientY = isTouch && touchEvent.touches && touchEvent.touches.length > 0 ? touchEvent.touches[0].clientY : mouseEvent.clientY;
          const dx = clientX - startX;
          const dy = clientY - startY;
          const rect = getBubbleRect();
          const w = rect.width;
          const h = rect.height;
          let newLeft = initialX + dx;
          let newTop = initialY + dy;
          const maxLeft = window.innerWidth - w;
          const maxTop = window.innerHeight - h;
          newLeft = Math.max(0, Math.min(newLeft, maxLeft));
          newTop = Math.max(0, Math.min(newTop, maxTop));
          bubbleContainer.style.bottom = "auto";
          bubbleContainer.style.right = "auto";
          bubbleContainer.style.left = `${newLeft}px`;
          bubbleContainer.style.top = `${newTop}px`;
        };
        const dragEnd = () => {
          isDragging = false;
          if (bubbleContainer) {
            bubbleContainer.style.cursor = "grab";
            const left = parseFloat(bubbleContainer.style.left) || 0;
            const top = parseFloat(bubbleContainer.style.top) || 0;
            twseconfig.bubble_position = { left, top };
          }
          document.removeEventListener("mousemove", dragMove);
          document.removeEventListener("touchmove", dragMove);
          document.removeEventListener("mouseup", dragEnd);
          document.removeEventListener("touchend", dragEnd);
        };
        bubbleContainer.addEventListener("mousedown", dragStart);
        bubbleContainer.addEventListener("touchstart", dragStart, {
          passive: false
        });
      }
      document.addEventListener("visibilitychange", () => {
        pageVisible = !document.hidden;
      });
      function injectCopyButton(id, li) {
        if (li.querySelector(".twse-copy-btn")) return;
        const atag = li.querySelector(
          "a[href^='/profiles.php']"
        );
        if (!atag) return;
        const parent = li.querySelector(".member");
        if (!parent) return;
        const copyBtn = document.createElement("button");
        copyBtn.className = "twse-copy-btn";
        copyBtn.type = "button";
        copyBtn.title = "Copy Name [ID]";
        copyBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="twse-copy-icon"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
      `;
        copyBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const name = atag.textContent?.trim() || "";
          const copyText = `${name} [${id}]`;
          const success = await copyToClipboard(copyText);
          if (success) {
            copyBtn.classList.add("success");
            copyBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="twse-copy-icon-success"><polyline points="20 6 9 17 4 12"></polyline></svg>
          `;
            setTimeout(() => {
              copyBtn.classList.remove("success");
              copyBtn.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="twse-copy-icon"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            `;
            }, 1e3);
          }
        });
        parent.appendChild(copyBtn);
      }
      function extractAllMemberLis() {
        memberLis.clear();
        const memberLists = document.querySelectorAll("ul.members-list");
        memberLists.forEach((ul) => {
          const lis = ul.querySelectorAll("li.enemy, li.your");
          lis.forEach((li) => {
            const atag = li.querySelector(
              "a[href^='/profiles.php']"
            );
            if (!atag) return;
            const parts = atag.href.split("ID=");
            if (parts.length <= 1) return;
            const id = parts[1];
            memberLis.set(id, {
              li,
              statusDiv: li.querySelector("div.status")
            });
            injectCopyButton(id, li);
          });
        });
      }
      function getFactionIds() {
        const memberLists = document.querySelectorAll("ul.members-list");
        const ids = [];
        memberLists.forEach((elem) => {
          const q = elem.querySelector(
            "a[href^='/factions.php']"
          );
          if (!q) return;
          const s = q.href.split("ID=");
          if (s.length <= 1) return;
          const id = s[1];
          if (id) {
            ids.push(id);
          }
        });
        return ids;
      }
      function getSortedColumn(memberList) {
        const parent = memberList.parentNode;
        if (!parent) return { column: null, order: null };
        const memberDiv = parent.querySelector("div.member div");
        const levelDiv = parent.querySelector("div.level div");
        const pointsDiv = parent.querySelector("div.points div");
        const statusDiv = parent.querySelector("div.status div");
        let column = null;
        let classname = "";
        if (memberDiv?.className.includes("activeIcon__")) {
          column = "member";
          classname = memberDiv.className;
        } else if (levelDiv?.className.includes("activeIcon__")) {
          column = "level";
          classname = levelDiv.className;
        } else if (pointsDiv?.className.includes("activeIcon__")) {
          column = "points";
          classname = pointsDiv.className;
        } else if (statusDiv?.className.includes("activeIcon__")) {
          column = "status";
          classname = statusDiv.className;
        }
        const order = classname.includes("asc__") ? "asc" : "desc";
        if (column && (column !== "points" || order !== "desc")) {
          everSorted = true;
        }
        return { column, order };
      }
      function populateCachedStatus(factionId) {
        const cached = factionCache.get(factionId);
        if (!cached) return;
        for (const [id, status] of Object.entries(cached)) {
          memberStatus.set(id, status);
        }
        log$1.info(
          `Populated war monitor cache with stored statuses for faction: ${factionId}`
        );
      }
      function queueAttrWrite(elem, attr, value) {
        if (elem.getAttribute(attr) !== value) {
          deferredWrites.push([elem, attr, value]);
          return true;
        }
        return false;
      }
      function queueStyleWrite(elem, prop, value) {
        if (elem.style.getPropertyValue(prop) !== value) {
          deferredStyles.push([elem, prop, value]);
        }
      }
      function calculateFlightTimeRemaining(li) {
        const earliestArrivalAttr = li.getAttribute("data-earliest-arrival");
        const latestArrivalAttr = li.getAttribute("data-latest-arrival");
        if (!earliestArrivalAttr && !latestArrivalAttr) return "";
        const earliestArrival = parseInt(earliestArrivalAttr || "", 10);
        const latestArrival = parseInt(latestArrivalAttr || "", 10);
        if (Number.isNaN(earliestArrival) && Number.isNaN(latestArrival))
          return "";
        const now = getCurrentTimeSec();
        if (!Number.isNaN(earliestArrival) && earliestArrival > now) {
          const remaining = Math.round(earliestArrival - now);
          return ` ${calc_delta(remaining, false, false)}`;
        }
        if (!Number.isNaN(latestArrival) && latestArrival > now) {
          const remaining = Math.round(latestArrival - now);
          return ` <${calc_delta(remaining, false, false)}`;
        }
        return " LATE";
      }
      async function updateStatuses() {
        if (!running) return;
        const factionIds = getFactionIds();
        if (factionIds.length === 0) return;
        const now = Date.now();
        if (now - lastRequestTime < minTimeBetweenRequestsMs) return;
        lastRequestTime = now;
        for (const factionId of factionIds) {
          log$1.debug(`Fetching API status update for faction: ${factionId}`);
          const data = await tornApi.fetchFactionData(factionId);
          if (!data) continue;
          if (data.error) {
            if (tornApi.isUnrecoverableError(data.error.code)) {
              log$1.error(
                "Torn API returned unrecoverable error. Halting war monitor polling."
              );
              running = false;
              break;
            }
            continue;
          }
          if (!data.members) continue;
          const reqTime = Date.now();
          const factionStatus = {};
          for (const [id, memberData] of Object.entries(data.members)) {
            const status = memberData.status;
            status.last_req_time = reqTime;
            const prev = memberStatus.get(id);
            const prev_state = prev?.state ?? "Unknown";
            const prev_since = prev?.since ?? reqTime;
            if (prev_state === status.state) {
              status.since = prev_since;
            } else {
              status.since = reqTime;
            }
            memberStatus.set(id, status);
            factionStatus[id] = status;
          }
          factionCache.set(factionId, factionStatus);
          if (data.chain) {
            activeChains.set(factionId, {
              current: data.chain.current,
              max: data.chain.max,
              timeout: data.chain.timeout,
              modifier: data.chain.modifier,
              tag: data.tag || "",
              apiReceivedAt: getCurrentTimeSec(),
              cooldown: data.chain.cooldown || 0,
              end: data.chain.end
            });
          }
        }
      }
      function watch() {
        deferredWrites.length = 0;
        deferredStyles.length = 0;
        let dirtySort = false;
        memberLis.forEach((elem, id) => {
          const li = elem.li;
          const statusDiv = elem.statusDiv;
          if (!li || !statusDiv) return;
          const status = memberStatus.get(id);
          if (!status || !running) {
            queueStyleWrite(
              statusDiv,
              "--twse-content",
              `"${statusDiv.textContent || ""}"`
            );
            return;
          }
          if (queueAttrWrite(li, "data-until", String(status.until))) {
            dirtySort = true;
          }
          if (queueAttrWrite(li, "data-since", String(status.since))) {
            dirtySort = true;
          }
          let dataLocation = "";
          switch (status.state) {
            case "Abroad":
            case "Traveling": {
              const hasTravelingClass = statusDiv.classList.contains("traveling") || statusDiv.classList.contains("abroad");
              if (!hasTravelingClass) {
                if (statusDiv.textContent === "Okay") {
                  queueAttrWrite(statusDiv, STATUS_DIFFERS, "true");
                  if (queueAttrWrite(li, "data-sortA", "0")) {
                    dirtySort = true;
                  }
                }
                queueStyleWrite(
                  statusDiv,
                  "--twse-content",
                  `"${statusDiv.textContent || ""}"`
                );
                break;
              }
              queueAttrWrite(statusDiv, STATUS_DIFFERS, "false");
              if (status.description.includes("In ")) {
                if (queueAttrWrite(li, "data-sortA", "4")) {
                  dirtySort = true;
                }
                const content = shorten_destination(
                  status.description.split("In ")[1]
                );
                dataLocation = content;
                queueStyleWrite(statusDiv, "--twse-content", `"${content}"`);
                break;
              }
              const route = extract_destinations_from_description(
                status.description
              );
              if (route?.from === "TC") {
                if (queueAttrWrite(li, "data-sortA", "5")) {
                  dirtySort = true;
                }
                const dest = route.to;
                dataLocation = `► ${dest}`;
                const remaining = calculateFlightTimeRemaining(li);
                queueStyleWrite(
                  statusDiv,
                  "--twse-content",
                  `"${dataLocation}${remaining}"`
                );
              } else if (route?.to === "TC") {
                if (queueAttrWrite(li, "data-sortA", "3")) {
                  dirtySort = true;
                }
                const dest = route.from;
                dataLocation = `◄ ${dest}`;
                const remaining = calculateFlightTimeRemaining(li);
                queueStyleWrite(
                  statusDiv,
                  "--twse-content",
                  `"${dataLocation}${remaining}"`
                );
              } else {
                if (queueAttrWrite(li, "data-sortA", "6")) {
                  dirtySort = true;
                }
                dataLocation = "Traveling";
                queueStyleWrite(statusDiv, "--twse-content", `"${dataLocation}"`);
              }
              break;
            }
            case "Hospital":
            case "Jail": {
              const now = getCurrentTimeSec();
              const timeRemaining = Math.round(status.until - now);
              const hasHospitalClass = statusDiv.classList.contains("hospital") || statusDiv.classList.contains("jail");
              if (!hasHospitalClass) {
                if (timeRemaining >= 0) {
                  if (queueAttrWrite(li, "data-sortA", "0")) {
                    dirtySort = true;
                  }
                  queueAttrWrite(statusDiv, STATUS_DIFFERS, "true");
                }
                queueStyleWrite(
                  statusDiv,
                  "--twse-content",
                  `"${statusDiv.textContent || ""}"`
                );
                queueAttrWrite(statusDiv, TRAVELING, "false");
                queueAttrWrite(statusDiv, HIGHLIGHT, "false");
                break;
              }
              queueAttrWrite(statusDiv, STATUS_DIFFERS, "false");
              if (queueAttrWrite(li, "data-sortA", "2")) {
                dirtySort = true;
              }
              if (status.description.includes("In a")) {
                queueAttrWrite(statusDiv, TRAVELING, "true");
              } else {
                queueAttrWrite(statusDiv, TRAVELING, "false");
              }
              if (timeRemaining <= 0) {
                queueAttrWrite(statusDiv, HIGHLIGHT, "false");
                break;
              }
              const timeStr = calc_delta(timeRemaining);
              queueStyleWrite(statusDiv, "--twse-content", `"${timeStr}"`);
              if (timeRemaining < 300) {
                queueAttrWrite(statusDiv, HIGHLIGHT, "true");
              } else {
                queueAttrWrite(statusDiv, HIGHLIGHT, "false");
              }
              break;
            }
            default:
              queueStyleWrite(
                statusDiv,
                "--twse-content",
                `"${statusDiv.textContent || ""}"`
              );
              if (queueAttrWrite(li, "data-sortA", "1")) {
                dirtySort = true;
              }
              queueAttrWrite(statusDiv, TRAVELING, "false");
              queueAttrWrite(statusDiv, HIGHLIGHT, "false");
              queueAttrWrite(statusDiv, STATUS_DIFFERS, "false");
              break;
          }
          if (li.getAttribute("data-location") !== dataLocation) {
            queueAttrWrite(li, "data-location", dataLocation);
            dirtySort = true;
          }
        });
        if (deferredWrites.length > 0) {
          for (const [elem, attr, val] of deferredWrites) {
            elem.setAttribute(attr, val);
          }
          deferredWrites.length = 0;
        }
        if (deferredStyles.length > 0) {
          for (const [elem, prop, val] of deferredStyles) {
            elem.style.setProperty(prop, val);
          }
          deferredStyles.length = 0;
        }
        if (twseconfig.war_sorting && dirtySort) {
          const memberLists = document.querySelectorAll("ul.members-list");
          for (let i = 0; i < memberLists.length; i++) {
            const listElem = memberLists[i];
            let sortedColumn = getSortedColumn(listElem);
            if (!everSorted) {
              sortedColumn = { column: "status", order: "asc" };
            }
            if (listElem.getAttribute("data-ffscouter-active-filter") === "true") {
              ffscouterSortingDeferred = true;
              continue;
            }
            if (sortedColumn.column !== "status") {
              continue;
            }
            const lis = Array.from(listElem.childNodes);
            const validLis = lis.filter(
              (node) => node.nodeType === Node.ELEMENT_NODE
            );
            const sortedLis = validLis.sort((a, b) => {
              let left = a;
              let right = b;
              if (sortedColumn.order === "desc") {
                left = b;
                right = a;
              }
              const sortA_a = parseInt(
                left.getAttribute("data-sortA") || "1",
                10
              );
              const sortA_b = parseInt(
                right.getAttribute("data-sortA") || "1",
                10
              );
              const sorta = sortA_a - sortA_b;
              if (sorta !== 0) {
                return sorta;
              }
              const leftLocation = left.getAttribute("data-location") || "";
              const rightLocation = right.getAttribute("data-location") || "";
              if (leftLocation && rightLocation) {
                if (leftLocation < rightLocation) return -1;
                if (leftLocation > rightLocation) return 1;
                return 0;
              }
              if (sortA_a === 0 || sortA_a === 1) {
                const since_a = parseInt(
                  left.getAttribute("data-since") || "0",
                  10
                );
                const since_b = parseInt(
                  right.getAttribute("data-since") || "0",
                  10
                );
                return since_b - since_a;
              }
              const until_a = parseInt(
                left.getAttribute("data-until") || "0",
                10
              );
              const until_b = parseInt(
                right.getAttribute("data-until") || "0",
                10
              );
              return until_a - until_b;
            });
            let sorted = true;
            for (let j = 0; j < sortedLis.length; j++) {
              if (listElem.children[j] !== sortedLis[j]) {
                sorted = false;
                break;
              }
            }
            if (!sorted) {
              const fragment = document.createDocumentFragment();
              sortedLis.forEach((li) => {
                fragment.appendChild(li);
              });
              listElem.appendChild(fragment);
            }
          }
        }
        if (ffscouterSortingDeferred) {
          const memberLists = document.querySelectorAll("ul.members-list");
          let activeFilterFound = false;
          for (let i = 0; i < memberLists.length; i++) {
            if (memberLists[i].getAttribute("data-ffscouter-active-filter") === "true") {
              activeFilterFound = true;
              break;
            }
          }
          if (!activeFilterFound) {
            ffscouterSortingDeferred = false;
            dirtySort = true;
          }
        }
        for (const [id, ref] of memberLis) {
          if (!ref.li.isConnected) {
            memberLis.delete(id);
          }
        }
        updateChainBubble();
      }
      function updateChainBubble() {
        if (!bubbleContainer) return;
        if (!foundWar || activeChains.size === 0) {
          bubbleContainer.classList.add("hidden");
          return;
        }
        const bodyContainer = bubbleContainer.querySelector(".twse-chain-body");
        if (!bodyContainer) return;
        let html = "";
        const now = getCurrentTimeSec();
        activeChains.forEach((chain) => {
          let formattedTime = "";
          let timerClass = "okay";
          let countClass = "";
          if (chain.cooldown > 0) {
            const elapsed = now - chain.apiReceivedAt;
            const remainingCooldown = Math.max(0, chain.cooldown - elapsed);
            formattedTime = formatChainCooldown(remainingCooldown);
            timerClass = "cooldown";
            countClass = "cooldown";
          } else if (chain.timeout === 0) {
            formattedTime = "-:--";
            timerClass = "okay";
          } else {
            const elapsed = now - chain.apiReceivedAt;
            const remaining = chain.end && chain.end > 0 ? chain.end - now : chain.timeout - elapsed;
            formattedTime = formatChainTimeout(remaining);
            if (remaining < 0) {
              timerClass = "negative";
            } else if (remaining < 60) {
              timerClass = "urgent";
            }
          }
          html += `
          <div class="twse-chain-row">
            <span class="twse-chain-tag">[${chain.tag || "Faction"}]</span>
            <div class="twse-chain-stats">
              <span class="twse-chain-count ${countClass}">${chain.current}/${chain.max}</span>
              <span class="twse-chain-mult">${chain.modifier.toFixed(2)}x</span>
              <span class="twse-chain-timer ${timerClass}">${formattedTime}</span>
            </div>
          </div>
        `;
        });
        bodyContainer.innerHTML = html;
        bubbleContainer.classList.remove("hidden");
      }
      const initWarMonitoring = (descriptions) => {
        log$1.info("Descriptions container detected. Starting observation.");
        let injectedToggle = false;
        const injectSortingToggle = (descEl) => {
          if (injectedToggle) return;
          if (descEl.querySelector("#twse-war-sort-checkbox")) {
            injectedToggle = true;
            return;
          }
          const graphContainer = descEl.querySelector('[class*="graphIcon"]');
          if (!graphContainer || !graphContainer.parentNode) return;
          const parent = graphContainer.parentNode;
          parent.style.position = "relative";
          const computedStyle = window.getComputedStyle(graphContainer);
          const toggleContainer = document.createElement("div");
          toggleContainer.className = "twse-sort-toggle-container";
          toggleContainer.style.top = computedStyle.top && computedStyle.top !== "auto" ? computedStyle.top : "10px";
          toggleContainer.innerHTML = `
          <label class="twse-sort-toggle-label">
            <input type="checkbox" id="twse-war-sort-checkbox" class="twse-sort-toggle-checkbox" ${twseconfig.war_sorting ? "checked" : ""} />
            TWSE Sort
          </label>
        `;
          graphContainer.parentNode.insertBefore(toggleContainer, graphContainer);
          log$1.info(
            "Successfully injected war sorting toggle checkbox before Graph link."
          );
          injectedToggle = true;
          const checkbox = toggleContainer.querySelector(
            "#twse-war-sort-checkbox"
          );
          if (checkbox) {
            checkbox.addEventListener("change", (e) => {
              const isChecked = e.target.checked;
              log$1.info(`War sorting configuration changed: ${isChecked}`);
              twseconfig.war_sorting = isChecked;
            });
          }
        };
        injectSortingToggle(descriptions);
        observeElement(descriptions, () => {
          if (!injectedToggle) {
            injectSortingToggle(descriptions);
          }
          if (!foundWar && descriptions.querySelector(".faction-war")) {
            foundWar = true;
            extractAllMemberLis();
            const ids = getFactionIds();
            ids.forEach(populateCachedStatus);
            updateStatuses();
          }
        });
        if (descriptions.querySelector(".faction-war")) {
          foundWar = true;
          extractAllMemberLis();
          const ids = getFactionIds();
          ids.forEach(populateCachedStatus);
          updateStatuses();
        }
      };
      const factWarList = await waitForElement("#faction_war_list_id");
      if (factWarList) {
        const descriptionsObserver = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (node instanceof HTMLElement && node.classList.contains("descriptions")) {
                log$1.info("Observed descriptions container added to DOM");
                initWarMonitoring(node);
              }
            }
          }
        });
        descriptionsObserver.observe(factWarList, { childList: true });
        const existingDescriptions = factWarList.querySelector(".descriptions");
        if (existingDescriptions) {
          log$1.info("Found existing descriptions container");
          initWarMonitoring(existingDescriptions);
        }
      }
      setInterval(() => {
        if (running && foundWar) {
          updateStatuses();
        }
      }, 1e4);
      setInterval(() => {
        if (foundWar && running && pageVisible) {
          watch();
        }
      }, 500);
      window.dispatchEvent(new Event("FFScouterV2DisableWarMonitor"));
    }
  };
  const __vite_glob_0_1 = Object.freeze( Object.defineProperty({
    __proto__: null,
    default: WarMonitorFeature
  }, Symbol.toStringTag, { value: "Module" }));
  const modules = Object.assign({
    "./key-manager/index.ts": __vite_glob_0_0,
    "./war-monitor/index.ts": __vite_glob_0_1
  });
  const Features = Object.values(modules).map((mod) => mod.default).filter((feat) => !!feat && "name" in feat);
  const log = logger.child("boot");
  async function boot() {
    log.info("Initializing Torn War Stuff Enhanced...");
    for (const feature of Features) {
      try {
        const shouldRun = await feature.shouldRun();
        if (!shouldRun) {
          continue;
        }
        log.debug(`Booting feature: '${feature.name}'`);
        if (feature.executionTime === StartTime.DocumentStart) {
          feature.run();
        } else if (feature.executionTime === StartTime.DocumentBody) {
          if (document.body) {
            feature.run();
          } else {
            let booted = false;
            const trigger = () => {
              if (booted) return;
              booted = true;
              bodyObserver.disconnect();
              feature.run();
            };
            const bodyObserver = new MutationObserver(() => {
              if (document.body) {
                trigger();
              }
            });
            bodyObserver.observe(document.documentElement, {
              childList: true
            });
            document.addEventListener("DOMContentLoaded", trigger);
          }
        } else {
          if (document.readyState === "complete" || document.readyState === "interactive") {
            feature.run();
          } else {
            document.addEventListener("DOMContentLoaded", () => {
              feature.run();
            });
          }
        }
      } catch (e) {
        log.error(`Error running feature '${feature.name}':`, e);
      }
    }
  }
  boot();

})();