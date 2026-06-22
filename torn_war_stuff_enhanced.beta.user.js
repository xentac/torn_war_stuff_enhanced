// ==UserScript==
// @name         Torn War Stuff Enhanced Beta
// @namespace    namespace-beta
// @version      2.0-beta24
// @author       xentac
// @description  Show travel status and hospital time and sort by hospital time on war page.
// @license      MIT
// @match        https://www.torn.com/factions.php*
// @connect      api.torn.com
// @connect      twse.dev
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
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
constructor(prefix = "", defaultLevel = 1, state = {}) {
      this.isPDA = false;
      this.colors = {
        debug: "#7f8c8d",
        info: "#3498db",
        warn: "#f39c12",
        error: "#e74c3c"
      };
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
  const log$8 = logger.child("storage");
  class Storage {
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
        log$8.error(`Error storing item '${key}':`, error);
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
          log$8.warn(`Key '${key}' has invalid JSON in it.`);
          this.remove(key);
          return null;
        }
        if (item.expiration && Date.now() > item.expiration) {
          this.remove(key);
          log$8.debug(`Key '${key}' has expired.`);
          return null;
        }
        return item.value;
      } catch (error) {
        log$8.error(`Error retrieving item '${key}':`, error);
        return null;
      }
    }
remove(key) {
      try {
        localStorage.removeItem(this.prefix + key);
      } catch (error) {
        log$8.error(`Error removing item '${key}':`, error);
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
        log$8.error("Error clearing storage:", error);
      }
    }
  }
  class Config {
    constructor(prefix = "twse-config-") {
      this.legacyPrefix = "xentac-torn_war_stuff_enhanced-";
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
get bubble_enabled() {
      return this.storage.get(
        "bubble_enabled"
) ?? true;
    }
    set bubble_enabled(val) {
      this.storage.set("bubble_enabled", val);
    }
get copy_button_enabled() {
      return this.storage.get(
        "copy_button_enabled"
) ?? true;
    }
    set copy_button_enabled(val) {
      this.storage.set("copy_button_enabled", val);
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
      this.storage.remove(
        "bubble_enabled"
);
      this.storage.remove(
        "copy_button_enabled"
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
  const log$7 = logger.child("feature:key-manager");
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
              log$7.info("Successfully updated API Key registration");
              alert("Torn API key registered successfully!");
            } else {
              alert("Invalid key! A Torn API key must be exactly 16 characters.");
            }
          }
        });
        log$7.debug("Tampermonkey menu command 'Register Key' initialized");
      } else {
        log$7.warn("GM_registerMenuCommand is not available in this context.");
      }
    }
  };
  const __vite_glob_0_0 = Object.freeze( Object.defineProperty({
    __proto__: null,
    default: KeyManagerFeature
  }, Symbol.toStringTag, { value: "Module" }));
  const log$6 = logger.child("dom");
  function waitForElement(selector, timeoutMs = 15e3) {
    return new Promise((resolve) => {
      const existing = document.querySelector(selector);
      if (existing) {
        return resolve(existing);
      }
      const observer = new MutationObserver((_2, obs) => {
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
          log$6.debug(`Timeout waiting for element selector: '${selector}'`);
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
  function on_navigation(callback) {
    const nav = window.navigation;
    if (nav) {
      nav.addEventListener("currententrychange", callback);
      return () => {
        nav.removeEventListener("currententrychange", callback);
      };
    }
    const delayedCallback = () => {
      setTimeout(callback, 0);
    };
    window.addEventListener("popstate", delayedCallback);
    window.addEventListener("hashchange", delayedCallback);
    return () => {
      window.removeEventListener("popstate", delayedCallback);
      window.removeEventListener("hashchange", delayedCallback);
    };
  }
  function sort_by_attribute(a2, b2, attr, d2 = 0) {
    const left = parseInt(a2.getAttribute(attr) || `${d2}`, 10);
    const right = parseInt(b2.getAttribute(attr) || `${d2}`, 10);
    return left - right;
  }
  const t$2 = globalThis, e$2 = t$2.ShadowRoot && (void 0 === t$2.ShadyCSS || t$2.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, s$2 = Symbol(), o$4 = new WeakMap();
  let n$3 = class n {
    constructor(t2, e2, o2) {
      if (this._$cssResult$ = true, o2 !== s$2) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
      this.cssText = t2, this.t = e2;
    }
    get styleSheet() {
      let t2 = this.o;
      const s2 = this.t;
      if (e$2 && void 0 === t2) {
        const e2 = void 0 !== s2 && 1 === s2.length;
        e2 && (t2 = o$4.get(s2)), void 0 === t2 && ((this.o = t2 = new CSSStyleSheet()).replaceSync(this.cssText), e2 && o$4.set(s2, t2));
      }
      return t2;
    }
    toString() {
      return this.cssText;
    }
  };
  const r$4 = (t2) => new n$3("string" == typeof t2 ? t2 : t2 + "", void 0, s$2), S$1 = (s2, o2) => {
    if (e$2) s2.adoptedStyleSheets = o2.map((t2) => t2 instanceof CSSStyleSheet ? t2 : t2.styleSheet);
    else for (const e2 of o2) {
      const o3 = document.createElement("style"), n3 = t$2.litNonce;
      void 0 !== n3 && o3.setAttribute("nonce", n3), o3.textContent = e2.cssText, s2.appendChild(o3);
    }
  }, c$2 = e$2 ? (t2) => t2 : (t2) => t2 instanceof CSSStyleSheet ? ((t3) => {
    let e2 = "";
    for (const s2 of t3.cssRules) e2 += s2.cssText;
    return r$4(e2);
  })(t2) : t2;
  const { is: i$2, defineProperty: e$1, getOwnPropertyDescriptor: h$1, getOwnPropertyNames: r$3, getOwnPropertySymbols: o$3, getPrototypeOf: n$2 } = Object, a$1 = globalThis, c$1 = a$1.trustedTypes, l$1 = c$1 ? c$1.emptyScript : "", p$1 = a$1.reactiveElementPolyfillSupport, d$1 = (t2, s2) => t2, u$1 = { toAttribute(t2, s2) {
    switch (s2) {
      case Boolean:
        t2 = t2 ? l$1 : null;
        break;
      case Object:
      case Array:
        t2 = null == t2 ? t2 : JSON.stringify(t2);
    }
    return t2;
  }, fromAttribute(t2, s2) {
    let i2 = t2;
    switch (s2) {
      case Boolean:
        i2 = null !== t2;
        break;
      case Number:
        i2 = null === t2 ? null : Number(t2);
        break;
      case Object:
      case Array:
        try {
          i2 = JSON.parse(t2);
        } catch (t3) {
          i2 = null;
        }
    }
    return i2;
  } }, f$1 = (t2, s2) => !i$2(t2, s2), b$1 = { attribute: true, type: String, converter: u$1, reflect: false, useDefault: false, hasChanged: f$1 };
  Symbol.metadata ??= Symbol("metadata"), a$1.litPropertyMetadata ??= new WeakMap();
  let y$1 = class y extends HTMLElement {
    static addInitializer(t2) {
      this._$Ei(), (this.l ??= []).push(t2);
    }
    static get observedAttributes() {
      return this.finalize(), this._$Eh && [...this._$Eh.keys()];
    }
    static createProperty(t2, s2 = b$1) {
      if (s2.state && (s2.attribute = false), this._$Ei(), this.prototype.hasOwnProperty(t2) && ((s2 = Object.create(s2)).wrapped = true), this.elementProperties.set(t2, s2), !s2.noAccessor) {
        const i2 = Symbol(), h2 = this.getPropertyDescriptor(t2, i2, s2);
        void 0 !== h2 && e$1(this.prototype, t2, h2);
      }
    }
    static getPropertyDescriptor(t2, s2, i2) {
      const { get: e2, set: r2 } = h$1(this.prototype, t2) ?? { get() {
        return this[s2];
      }, set(t3) {
        this[s2] = t3;
      } };
      return { get: e2, set(s3) {
        const h2 = e2?.call(this);
        r2?.call(this, s3), this.requestUpdate(t2, h2, i2);
      }, configurable: true, enumerable: true };
    }
    static getPropertyOptions(t2) {
      return this.elementProperties.get(t2) ?? b$1;
    }
    static _$Ei() {
      if (this.hasOwnProperty(d$1("elementProperties"))) return;
      const t2 = n$2(this);
      t2.finalize(), void 0 !== t2.l && (this.l = [...t2.l]), this.elementProperties = new Map(t2.elementProperties);
    }
    static finalize() {
      if (this.hasOwnProperty(d$1("finalized"))) return;
      if (this.finalized = true, this._$Ei(), this.hasOwnProperty(d$1("properties"))) {
        const t3 = this.properties, s2 = [...r$3(t3), ...o$3(t3)];
        for (const i2 of s2) this.createProperty(i2, t3[i2]);
      }
      const t2 = this[Symbol.metadata];
      if (null !== t2) {
        const s2 = litPropertyMetadata.get(t2);
        if (void 0 !== s2) for (const [t3, i2] of s2) this.elementProperties.set(t3, i2);
      }
      this._$Eh = new Map();
      for (const [t3, s2] of this.elementProperties) {
        const i2 = this._$Eu(t3, s2);
        void 0 !== i2 && this._$Eh.set(i2, t3);
      }
      this.elementStyles = this.finalizeStyles(this.styles);
    }
    static finalizeStyles(s2) {
      const i2 = [];
      if (Array.isArray(s2)) {
        const e2 = new Set(s2.flat(1 / 0).reverse());
        for (const s3 of e2) i2.unshift(c$2(s3));
      } else void 0 !== s2 && i2.push(c$2(s2));
      return i2;
    }
    static _$Eu(t2, s2) {
      const i2 = s2.attribute;
      return false === i2 ? void 0 : "string" == typeof i2 ? i2 : "string" == typeof t2 ? t2.toLowerCase() : void 0;
    }
    constructor() {
      super(), this._$Ep = void 0, this.isUpdatePending = false, this.hasUpdated = false, this._$Em = null, this._$Ev();
    }
    _$Ev() {
      this._$ES = new Promise((t2) => this.enableUpdating = t2), this._$AL = new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((t2) => t2(this));
    }
    addController(t2) {
      (this._$EO ??= new Set()).add(t2), void 0 !== this.renderRoot && this.isConnected && t2.hostConnected?.();
    }
    removeController(t2) {
      this._$EO?.delete(t2);
    }
    _$E_() {
      const t2 = new Map(), s2 = this.constructor.elementProperties;
      for (const i2 of s2.keys()) this.hasOwnProperty(i2) && (t2.set(i2, this[i2]), delete this[i2]);
      t2.size > 0 && (this._$Ep = t2);
    }
    createRenderRoot() {
      const t2 = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
      return S$1(t2, this.constructor.elementStyles), t2;
    }
    connectedCallback() {
      this.renderRoot ??= this.createRenderRoot(), this.enableUpdating(true), this._$EO?.forEach((t2) => t2.hostConnected?.());
    }
    enableUpdating(t2) {
    }
    disconnectedCallback() {
      this._$EO?.forEach((t2) => t2.hostDisconnected?.());
    }
    attributeChangedCallback(t2, s2, i2) {
      this._$AK(t2, i2);
    }
    _$ET(t2, s2) {
      const i2 = this.constructor.elementProperties.get(t2), e2 = this.constructor._$Eu(t2, i2);
      if (void 0 !== e2 && true === i2.reflect) {
        const h2 = (void 0 !== i2.converter?.toAttribute ? i2.converter : u$1).toAttribute(s2, i2.type);
        this._$Em = t2, null == h2 ? this.removeAttribute(e2) : this.setAttribute(e2, h2), this._$Em = null;
      }
    }
    _$AK(t2, s2) {
      const i2 = this.constructor, e2 = i2._$Eh.get(t2);
      if (void 0 !== e2 && this._$Em !== e2) {
        const t3 = i2.getPropertyOptions(e2), h2 = "function" == typeof t3.converter ? { fromAttribute: t3.converter } : void 0 !== t3.converter?.fromAttribute ? t3.converter : u$1;
        this._$Em = e2;
        const r2 = h2.fromAttribute(s2, t3.type);
        this[e2] = r2 ?? this._$Ej?.get(e2) ?? r2, this._$Em = null;
      }
    }
    requestUpdate(t2, s2, i2, e2 = false, h2) {
      if (void 0 !== t2) {
        const r2 = this.constructor;
        if (false === e2 && (h2 = this[t2]), i2 ??= r2.getPropertyOptions(t2), !((i2.hasChanged ?? f$1)(h2, s2) || i2.useDefault && i2.reflect && h2 === this._$Ej?.get(t2) && !this.hasAttribute(r2._$Eu(t2, i2)))) return;
        this.C(t2, s2, i2);
      }
      false === this.isUpdatePending && (this._$ES = this._$EP());
    }
    C(t2, s2, { useDefault: i2, reflect: e2, wrapped: h2 }, r2) {
      i2 && !(this._$Ej ??= new Map()).has(t2) && (this._$Ej.set(t2, r2 ?? s2 ?? this[t2]), true !== h2 || void 0 !== r2) || (this._$AL.has(t2) || (this.hasUpdated || i2 || (s2 = void 0), this._$AL.set(t2, s2)), true === e2 && this._$Em !== t2 && (this._$Eq ??= new Set()).add(t2));
    }
    async _$EP() {
      this.isUpdatePending = true;
      try {
        await this._$ES;
      } catch (t3) {
        Promise.reject(t3);
      }
      const t2 = this.scheduleUpdate();
      return null != t2 && await t2, !this.isUpdatePending;
    }
    scheduleUpdate() {
      return this.performUpdate();
    }
    performUpdate() {
      if (!this.isUpdatePending) return;
      if (!this.hasUpdated) {
        if (this.renderRoot ??= this.createRenderRoot(), this._$Ep) {
          for (const [t4, s3] of this._$Ep) this[t4] = s3;
          this._$Ep = void 0;
        }
        const t3 = this.constructor.elementProperties;
        if (t3.size > 0) for (const [s3, i2] of t3) {
          const { wrapped: t4 } = i2, e2 = this[s3];
          true !== t4 || this._$AL.has(s3) || void 0 === e2 || this.C(s3, void 0, i2, e2);
        }
      }
      let t2 = false;
      const s2 = this._$AL;
      try {
        t2 = this.shouldUpdate(s2), t2 ? (this.willUpdate(s2), this._$EO?.forEach((t3) => t3.hostUpdate?.()), this.update(s2)) : this._$EM();
      } catch (s3) {
        throw t2 = false, this._$EM(), s3;
      }
      t2 && this._$AE(s2);
    }
    willUpdate(t2) {
    }
    _$AE(t2) {
      this._$EO?.forEach((t3) => t3.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = true, this.firstUpdated(t2)), this.updated(t2);
    }
    _$EM() {
      this._$AL = new Map(), this.isUpdatePending = false;
    }
    get updateComplete() {
      return this.getUpdateComplete();
    }
    getUpdateComplete() {
      return this._$ES;
    }
    shouldUpdate(t2) {
      return true;
    }
    update(t2) {
      this._$Eq &&= this._$Eq.forEach((t3) => this._$ET(t3, this[t3])), this._$EM();
    }
    updated(t2) {
    }
    firstUpdated(t2) {
    }
  };
  y$1.elementStyles = [], y$1.shadowRootOptions = { mode: "open" }, y$1[d$1("elementProperties")] = new Map(), y$1[d$1("finalized")] = new Map(), p$1?.({ ReactiveElement: y$1 }), (a$1.reactiveElementVersions ??= []).push("2.1.2");
  const t$1 = globalThis, i$1 = (t2) => t2, s$1 = t$1.trustedTypes, e = s$1 ? s$1.createPolicy("lit-html", { createHTML: (t2) => t2 }) : void 0, h = "$lit$", o$2 = `lit$${Math.random().toFixed(9).slice(2)}$`, n$1 = "?" + o$2, r$2 = `<${n$1}>`, l = document, c = () => l.createComment(""), a = (t2) => null === t2 || "object" != typeof t2 && "function" != typeof t2, u = Array.isArray, d = (t2) => u(t2) || "function" == typeof t2?.[Symbol.iterator], f = "[ 	\n\f\r]", v = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, _ = /-->/g, m = />/g, p = RegExp(`>|${f}(?:([^\\s"'>=/]+)(${f}*=${f}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g"), g = /'/g, $ = /"/g, y2 = /^(?:script|style|textarea|title)$/i, x = (t2) => (i2, ...s2) => ({ _$litType$: t2, strings: i2, values: s2 }), b = x(1), E = Symbol.for("lit-noChange"), A = Symbol.for("lit-nothing"), C = new WeakMap(), P = l.createTreeWalker(l, 129);
  function V(t2, i2) {
    if (!u(t2) || !t2.hasOwnProperty("raw")) throw Error("invalid template strings array");
    return void 0 !== e ? e.createHTML(i2) : i2;
  }
  const N = (t2, i2) => {
    const s2 = t2.length - 1, e2 = [];
    let n3, l2 = 2 === i2 ? "<svg>" : 3 === i2 ? "<math>" : "", c2 = v;
    for (let i3 = 0; i3 < s2; i3++) {
      const s3 = t2[i3];
      let a2, u2, d2 = -1, f2 = 0;
      for (; f2 < s3.length && (c2.lastIndex = f2, u2 = c2.exec(s3), null !== u2); ) f2 = c2.lastIndex, c2 === v ? "!--" === u2[1] ? c2 = _ : void 0 !== u2[1] ? c2 = m : void 0 !== u2[2] ? (y2.test(u2[2]) && (n3 = RegExp("</" + u2[2], "g")), c2 = p) : void 0 !== u2[3] && (c2 = p) : c2 === p ? ">" === u2[0] ? (c2 = n3 ?? v, d2 = -1) : void 0 === u2[1] ? d2 = -2 : (d2 = c2.lastIndex - u2[2].length, a2 = u2[1], c2 = void 0 === u2[3] ? p : '"' === u2[3] ? $ : g) : c2 === $ || c2 === g ? c2 = p : c2 === _ || c2 === m ? c2 = v : (c2 = p, n3 = void 0);
      const x2 = c2 === p && t2[i3 + 1].startsWith("/>") ? " " : "";
      l2 += c2 === v ? s3 + r$2 : d2 >= 0 ? (e2.push(a2), s3.slice(0, d2) + h + s3.slice(d2) + o$2 + x2) : s3 + o$2 + (-2 === d2 ? i3 : x2);
    }
    return [V(t2, l2 + (t2[s2] || "<?>") + (2 === i2 ? "</svg>" : 3 === i2 ? "</math>" : "")), e2];
  };
  class S {
    constructor({ strings: t2, _$litType$: i2 }, e2) {
      let r2;
      this.parts = [];
      let l2 = 0, a2 = 0;
      const u2 = t2.length - 1, d2 = this.parts, [f2, v2] = N(t2, i2);
      if (this.el = S.createElement(f2, e2), P.currentNode = this.el.content, 2 === i2 || 3 === i2) {
        const t3 = this.el.content.firstChild;
        t3.replaceWith(...t3.childNodes);
      }
      for (; null !== (r2 = P.nextNode()) && d2.length < u2; ) {
        if (1 === r2.nodeType) {
          if (r2.hasAttributes()) for (const t3 of r2.getAttributeNames()) if (t3.endsWith(h)) {
            const i3 = v2[a2++], s2 = r2.getAttribute(t3).split(o$2), e3 = /([.?@])?(.*)/.exec(i3);
            d2.push({ type: 1, index: l2, name: e3[2], strings: s2, ctor: "." === e3[1] ? I : "?" === e3[1] ? L : "@" === e3[1] ? z : H }), r2.removeAttribute(t3);
          } else t3.startsWith(o$2) && (d2.push({ type: 6, index: l2 }), r2.removeAttribute(t3));
          if (y2.test(r2.tagName)) {
            const t3 = r2.textContent.split(o$2), i3 = t3.length - 1;
            if (i3 > 0) {
              r2.textContent = s$1 ? s$1.emptyScript : "";
              for (let s2 = 0; s2 < i3; s2++) r2.append(t3[s2], c()), P.nextNode(), d2.push({ type: 2, index: ++l2 });
              r2.append(t3[i3], c());
            }
          }
        } else if (8 === r2.nodeType) if (r2.data === n$1) d2.push({ type: 2, index: l2 });
        else {
          let t3 = -1;
          for (; -1 !== (t3 = r2.data.indexOf(o$2, t3 + 1)); ) d2.push({ type: 7, index: l2 }), t3 += o$2.length - 1;
        }
        l2++;
      }
    }
    static createElement(t2, i2) {
      const s2 = l.createElement("template");
      return s2.innerHTML = t2, s2;
    }
  }
  function M(t2, i2, s2 = t2, e2) {
    if (i2 === E) return i2;
    let h2 = void 0 !== e2 ? s2._$Co?.[e2] : s2._$Cl;
    const o2 = a(i2) ? void 0 : i2._$litDirective$;
    return h2?.constructor !== o2 && (h2?._$AO?.(false), void 0 === o2 ? h2 = void 0 : (h2 = new o2(t2), h2._$AT(t2, s2, e2)), void 0 !== e2 ? (s2._$Co ??= [])[e2] = h2 : s2._$Cl = h2), void 0 !== h2 && (i2 = M(t2, h2._$AS(t2, i2.values), h2, e2)), i2;
  }
  class R {
    constructor(t2, i2) {
      this._$AV = [], this._$AN = void 0, this._$AD = t2, this._$AM = i2;
    }
    get parentNode() {
      return this._$AM.parentNode;
    }
    get _$AU() {
      return this._$AM._$AU;
    }
    u(t2) {
      const { el: { content: i2 }, parts: s2 } = this._$AD, e2 = (t2?.creationScope ?? l).importNode(i2, true);
      P.currentNode = e2;
      let h2 = P.nextNode(), o2 = 0, n3 = 0, r2 = s2[0];
      for (; void 0 !== r2; ) {
        if (o2 === r2.index) {
          let i3;
          2 === r2.type ? i3 = new k(h2, h2.nextSibling, this, t2) : 1 === r2.type ? i3 = new r2.ctor(h2, r2.name, r2.strings, this, t2) : 6 === r2.type && (i3 = new Z(h2, this, t2)), this._$AV.push(i3), r2 = s2[++n3];
        }
        o2 !== r2?.index && (h2 = P.nextNode(), o2++);
      }
      return P.currentNode = l, e2;
    }
    p(t2) {
      let i2 = 0;
      for (const s2 of this._$AV) void 0 !== s2 && (void 0 !== s2.strings ? (s2._$AI(t2, s2, i2), i2 += s2.strings.length - 2) : s2._$AI(t2[i2])), i2++;
    }
  }
  class k {
    get _$AU() {
      return this._$AM?._$AU ?? this._$Cv;
    }
    constructor(t2, i2, s2, e2) {
      this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t2, this._$AB = i2, this._$AM = s2, this.options = e2, this._$Cv = e2?.isConnected ?? true;
    }
    get parentNode() {
      let t2 = this._$AA.parentNode;
      const i2 = this._$AM;
      return void 0 !== i2 && 11 === t2?.nodeType && (t2 = i2.parentNode), t2;
    }
    get startNode() {
      return this._$AA;
    }
    get endNode() {
      return this._$AB;
    }
    _$AI(t2, i2 = this) {
      t2 = M(this, t2, i2), a(t2) ? t2 === A || null == t2 || "" === t2 ? (this._$AH !== A && this._$AR(), this._$AH = A) : t2 !== this._$AH && t2 !== E && this._(t2) : void 0 !== t2._$litType$ ? this.$(t2) : void 0 !== t2.nodeType ? this.T(t2) : d(t2) ? this.k(t2) : this._(t2);
    }
    O(t2) {
      return this._$AA.parentNode.insertBefore(t2, this._$AB);
    }
    T(t2) {
      this._$AH !== t2 && (this._$AR(), this._$AH = this.O(t2));
    }
    _(t2) {
      this._$AH !== A && a(this._$AH) ? this._$AA.nextSibling.data = t2 : this.T(l.createTextNode(t2)), this._$AH = t2;
    }
    $(t2) {
      const { values: i2, _$litType$: s2 } = t2, e2 = "number" == typeof s2 ? this._$AC(t2) : (void 0 === s2.el && (s2.el = S.createElement(V(s2.h, s2.h[0]), this.options)), s2);
      if (this._$AH?._$AD === e2) this._$AH.p(i2);
      else {
        const t3 = new R(e2, this), s3 = t3.u(this.options);
        t3.p(i2), this.T(s3), this._$AH = t3;
      }
    }
    _$AC(t2) {
      let i2 = C.get(t2.strings);
      return void 0 === i2 && C.set(t2.strings, i2 = new S(t2)), i2;
    }
    k(t2) {
      u(this._$AH) || (this._$AH = [], this._$AR());
      const i2 = this._$AH;
      let s2, e2 = 0;
      for (const h2 of t2) e2 === i2.length ? i2.push(s2 = new k(this.O(c()), this.O(c()), this, this.options)) : s2 = i2[e2], s2._$AI(h2), e2++;
      e2 < i2.length && (this._$AR(s2 && s2._$AB.nextSibling, e2), i2.length = e2);
    }
    _$AR(t2 = this._$AA.nextSibling, s2) {
      for (this._$AP?.(false, true, s2); t2 !== this._$AB; ) {
        const s3 = i$1(t2).nextSibling;
        i$1(t2).remove(), t2 = s3;
      }
    }
    setConnected(t2) {
      void 0 === this._$AM && (this._$Cv = t2, this._$AP?.(t2));
    }
  }
  class H {
    get tagName() {
      return this.element.tagName;
    }
    get _$AU() {
      return this._$AM._$AU;
    }
    constructor(t2, i2, s2, e2, h2) {
      this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t2, this.name = i2, this._$AM = e2, this.options = h2, s2.length > 2 || "" !== s2[0] || "" !== s2[1] ? (this._$AH = Array(s2.length - 1).fill(new String()), this.strings = s2) : this._$AH = A;
    }
    _$AI(t2, i2 = this, s2, e2) {
      const h2 = this.strings;
      let o2 = false;
      if (void 0 === h2) t2 = M(this, t2, i2, 0), o2 = !a(t2) || t2 !== this._$AH && t2 !== E, o2 && (this._$AH = t2);
      else {
        const e3 = t2;
        let n3, r2;
        for (t2 = h2[0], n3 = 0; n3 < h2.length - 1; n3++) r2 = M(this, e3[s2 + n3], i2, n3), r2 === E && (r2 = this._$AH[n3]), o2 ||= !a(r2) || r2 !== this._$AH[n3], r2 === A ? t2 = A : t2 !== A && (t2 += (r2 ?? "") + h2[n3 + 1]), this._$AH[n3] = r2;
      }
      o2 && !e2 && this.j(t2);
    }
    j(t2) {
      t2 === A ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t2 ?? "");
    }
  }
  class I extends H {
    constructor() {
      super(...arguments), this.type = 3;
    }
    j(t2) {
      this.element[this.name] = t2 === A ? void 0 : t2;
    }
  }
  class L extends H {
    constructor() {
      super(...arguments), this.type = 4;
    }
    j(t2) {
      this.element.toggleAttribute(this.name, !!t2 && t2 !== A);
    }
  }
  class z extends H {
    constructor(t2, i2, s2, e2, h2) {
      super(t2, i2, s2, e2, h2), this.type = 5;
    }
    _$AI(t2, i2 = this) {
      if ((t2 = M(this, t2, i2, 0) ?? A) === E) return;
      const s2 = this._$AH, e2 = t2 === A && s2 !== A || t2.capture !== s2.capture || t2.once !== s2.once || t2.passive !== s2.passive, h2 = t2 !== A && (s2 === A || e2);
      e2 && this.element.removeEventListener(this.name, this, s2), h2 && this.element.addEventListener(this.name, this, t2), this._$AH = t2;
    }
    handleEvent(t2) {
      "function" == typeof this._$AH ? this._$AH.call(this.options?.host ?? this.element, t2) : this._$AH.handleEvent(t2);
    }
  }
  class Z {
    constructor(t2, i2, s2) {
      this.element = t2, this.type = 6, this._$AN = void 0, this._$AM = i2, this.options = s2;
    }
    get _$AU() {
      return this._$AM._$AU;
    }
    _$AI(t2) {
      M(this, t2);
    }
  }
  const B = t$1.litHtmlPolyfillSupport;
  B?.(S, k), (t$1.litHtmlVersions ??= []).push("3.3.3");
  const D = (t2, i2, s2) => {
    const e2 = s2?.renderBefore ?? i2;
    let h2 = e2._$litPart$;
    if (void 0 === h2) {
      const t3 = s2?.renderBefore ?? null;
      e2._$litPart$ = h2 = new k(i2.insertBefore(c(), t3), t3, void 0, s2 ?? {});
    }
    return h2._$AI(t2), h2;
  };
  const s = globalThis;
  class i extends y$1 {
    constructor() {
      super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
    }
    createRenderRoot() {
      const t2 = super.createRenderRoot();
      return this.renderOptions.renderBefore ??= t2.firstChild, t2;
    }
    update(t2) {
      const r2 = this.render();
      this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t2), this._$Do = D(r2, this.renderRoot, this.renderOptions);
    }
    connectedCallback() {
      super.connectedCallback(), this._$Do?.setConnected(true);
    }
    disconnectedCallback() {
      super.disconnectedCallback(), this._$Do?.setConnected(false);
    }
    render() {
      return E;
    }
  }
  i._$litElement$ = true, i["finalized"] = true, s.litElementHydrateSupport?.({ LitElement: i });
  const o$1 = s.litElementPolyfillSupport;
  o$1?.({ LitElement: i });
  (s.litElementVersions ??= []).push("4.2.2");
  const t = (t2) => (e2, o2) => {
    void 0 !== o2 ? o2.addInitializer(() => {
      customElements.define(t2, e2);
    }) : customElements.define(t2, e2);
  };
  const o = { attribute: true, type: String, converter: u$1, reflect: false, hasChanged: f$1 }, r$1 = (t2 = o, e2, r2) => {
    const { kind: n3, metadata: i2 } = r2;
    let s2 = globalThis.litPropertyMetadata.get(i2);
    if (void 0 === s2 && globalThis.litPropertyMetadata.set(i2, s2 = new Map()), "setter" === n3 && ((t2 = Object.create(t2)).wrapped = true), s2.set(r2.name, t2), "accessor" === n3) {
      const { name: o2 } = r2;
      return { set(r3) {
        const n4 = e2.get.call(this);
        e2.set.call(this, r3), this.requestUpdate(o2, n4, t2, true, r3);
      }, init(e3) {
        return void 0 !== e3 && this.C(o2, void 0, t2, e3), e3;
      } };
    }
    if ("setter" === n3) {
      const { name: o2 } = r2;
      return function(r3) {
        const n4 = this[o2];
        e2.call(this, r3), this.requestUpdate(o2, n4, t2, true, r3);
      };
    }
    throw Error("Unsupported decorator location: " + n3);
  };
  function n2(t2) {
    return (e2, o2) => "object" == typeof o2 ? r$1(t2, e2, o2) : ((t3, e3, o3) => {
      const r2 = e3.hasOwnProperty(o3);
      return e3.constructor.createProperty(o3, t3), r2 ? Object.getOwnPropertyDescriptor(e3, o3) : void 0;
    })(t2, e2, o2);
  }
  function r(r2) {
    return n2({ ...r2, state: true, attribute: false });
  }
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __decorateClass = (decorators, target, key, kind) => {
    var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
    for (var i2 = decorators.length - 1, decorator; i2 >= 0; i2--)
      if (decorator = decorators[i2])
        result = (kind ? decorator(target, key, result) : decorator(result)) || result;
    if (kind && result) __defProp(target, key, result);
    return result;
  };
  let TWSESettingsPanel = class extends i {
    constructor() {
      super(...arguments);
      this.apiKey = "";
      this.warSorting = true;
      this.bubbleEnabled = true;
      this.copyButtonEnabled = true;
      this.debugLogs = false;
      this.draftApiKey = "";
      this.draftWarSorting = true;
      this.draftBubbleEnabled = true;
      this.draftCopyButtonEnabled = true;
      this.draftDebugLogs = false;
      this.showSavedMessage = false;
    }
    createRenderRoot() {
      return this;
    }
    connectedCallback() {
      super.connectedCallback();
      this.resetDrafts();
    }
    willUpdate(changedProperties) {
      if (changedProperties.has("apiKey") || changedProperties.has("warSorting") || changedProperties.has("bubbleEnabled") || changedProperties.has("copyButtonEnabled") || changedProperties.has("debugLogs")) {
        this.resetDrafts();
      }
    }
    resetDrafts() {
      this.draftApiKey = this.apiKey;
      this.draftWarSorting = this.warSorting;
      this.draftBubbleEnabled = this.bubbleEnabled;
      this.draftCopyButtonEnabled = this.copyButtonEnabled;
      this.draftDebugLogs = this.debugLogs;
    }
    handleSave() {
      this.showSavedMessage = true;
      setTimeout(() => {
        this.showSavedMessage = false;
      }, 3e3);
      this.dispatchEvent(
        new CustomEvent("twse-save", {
          detail: {
            apiKey: this.draftApiKey,
            warSorting: this.draftWarSorting,
            bubbleEnabled: this.draftBubbleEnabled,
            copyButtonEnabled: this.draftCopyButtonEnabled,
            debugLogs: this.draftDebugLogs
          },
          bubbles: true,
          composed: true
        })
      );
    }
    handleReset() {
      if (confirm("Are you sure you want to reset all settings to defaults?")) {
        this.dispatchEvent(
          new CustomEvent("twse-reset", {
            bubbles: true,
            composed: true
          })
        );
      }
    }
    handleClearCache() {
      if (confirm("Are you sure you want to clear all TWSE war monitoring cache?")) {
        this.dispatchEvent(
          new CustomEvent("twse-clear-cache", {
            bubbles: true,
            composed: true
          })
        );
      }
    }
    onKeyInput(e2) {
      this.draftApiKey = e2.target.value;
      this.showSavedMessage = false;
    }
    onKeyChange(e2) {
      const val = e2.target.value.trim();
      this.draftApiKey = val;
      this.dispatchEvent(
        new CustomEvent("twse-save-key", {
          detail: { apiKey: val },
          bubbles: true,
          composed: true
        })
      );
    }
    onWarSortingChange(e2) {
      this.draftWarSorting = e2.target.checked;
      this.showSavedMessage = false;
    }
    onBubbleEnabledChange(e2) {
      this.draftBubbleEnabled = e2.target.checked;
      this.showSavedMessage = false;
    }
    onCopyButtonEnabledChange(e2) {
      this.draftCopyButtonEnabled = e2.target.checked;
      this.showSavedMessage = false;
    }
    onDebugLogsChange(e2) {
      this.draftDebugLogs = e2.target.checked;
      this.showSavedMessage = false;
    }
    render() {
      return b`
      <details class="accordion cont-gray border-round twse-settings-details">
        <summary style="cursor: pointer; font-weight: bold; user-select: none;">
          Torn War Stuff Enhanced Settings
        </summary>

        <div style="margin-top: 15px;">
          <!-- API Key Section -->
          <div class="input-row">
            <label for="twse-api-key">Torn API Key:</label>
            <input
              id="twse-api-key"
              type="text"
              class="${this.apiKey ? "blur-mode" : ""}"
              placeholder="Paste 16-char API key here..."
              maxlength="16"
              .value=${this.draftApiKey}
              @input=${this.onKeyInput}
              @change=${this.onKeyChange}
            />
            <div class="twse-api-explanation">
              <strong>Info:</strong> Provide a valid 16-character public API key to pull faction war information and real-time member statuses.
            </div>
          </div>

          <!-- Feature Toggles -->
          <h3>Feature Toggles:</h3>

          <!-- War sorting toggle -->
          <div class="input-row-inline">
            <input
              id="twse-war-sorting"
              type="checkbox"
              .checked=${this.draftWarSorting}
              @change=${this.onWarSortingChange}
            />
            <label for="twse-war-sorting">Enable War Page Sorting (automatically sorts okay/traveling/hospitalized members)</label>
          </div>

          <!-- Chain bubble toggle -->
          <div class="input-row-inline">
            <input
              id="twse-chain-bubble-toggle"
              type="checkbox"
              .checked=${this.draftBubbleEnabled}
              @change=${this.onBubbleEnabledChange}
            />
            <label for="twse-chain-bubble-toggle">Show Floating Chain Bubble (displays real-time countdown of your faction's chain)</label>
          </div>

          <!-- Copy button toggle -->
          <div class="input-row-inline">
            <input
              id="twse-copy-btn-toggle"
              type="checkbox"
              .checked=${this.draftCopyButtonEnabled}
              @change=${this.onCopyButtonEnabledChange}
            />
            <label for="twse-copy-btn-toggle">Enable "Copy Name [ID]" Button next to members</label>
          </div>

          <!-- Debug logs toggle -->
          <div class="input-row-inline">
            <input
              id="twse-debug-logs"
              type="checkbox"
              .checked=${this.draftDebugLogs}
              @change=${this.onDebugLogsChange}
            />
            <label for="twse-debug-logs">Enable Developer/Debug Logging</label>
          </div>

          <!-- Action Buttons -->
          <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px; margin-top: 20px;">
            <button class="torn-btn btn-save" @click=${this.handleSave}>
              Save Settings
            </button>
            <button class="torn-btn btn-secondary" @click=${this.handleReset}>
              Reset to Defaults
            </button>
            <button class="torn-btn btn-secondary" @click=${this.handleClearCache}>
              Clear Cache
            </button>
            ${this.showSavedMessage ? b`<span style="color: #4CAF50; font-weight: bold; margin-left: 10px;">✓ Saved!</span>` : ""}
          </div>
        </div>
      </details>
    `;
    }
  };
  __decorateClass([
    n2({ type: String })
  ], TWSESettingsPanel.prototype, "apiKey", 2);
  __decorateClass([
    n2({ type: Boolean })
  ], TWSESettingsPanel.prototype, "warSorting", 2);
  __decorateClass([
    n2({ type: Boolean })
  ], TWSESettingsPanel.prototype, "bubbleEnabled", 2);
  __decorateClass([
    n2({ type: Boolean })
  ], TWSESettingsPanel.prototype, "copyButtonEnabled", 2);
  __decorateClass([
    n2({ type: Boolean })
  ], TWSESettingsPanel.prototype, "debugLogs", 2);
  __decorateClass([
    r()
  ], TWSESettingsPanel.prototype, "draftApiKey", 2);
  __decorateClass([
    r()
  ], TWSESettingsPanel.prototype, "draftWarSorting", 2);
  __decorateClass([
    r()
  ], TWSESettingsPanel.prototype, "draftBubbleEnabled", 2);
  __decorateClass([
    r()
  ], TWSESettingsPanel.prototype, "draftCopyButtonEnabled", 2);
  __decorateClass([
    r()
  ], TWSESettingsPanel.prototype, "draftDebugLogs", 2);
  __decorateClass([
    r()
  ], TWSESettingsPanel.prototype, "showSavedMessage", 2);
  TWSESettingsPanel = __decorateClass([
    t("twse-settings-panel")
  ], TWSESettingsPanel);
  const log$5 = logger.child("feature:settings");
  const SettingsFeature = {
    name: "Settings",
    description: "Renders and handles the settings panel at the bottom of the faction page",
    executionTime: StartTime.DocumentEnd,
    shouldRun() {
      return window.location.href.includes("factions.php");
    },
    async run() {
      const factionsContainer = await waitForElement("#factions");
      if (!factionsContainer) {
        log$5.warn("Failed to find #factions element to append settings panel");
        return;
      }
      const panel = document.createElement("twse-settings-panel");
      panel.apiKey = twseconfig.apiKey;
      panel.warSorting = twseconfig.war_sorting;
      panel.bubbleEnabled = twseconfig.bubble_enabled;
      panel.copyButtonEnabled = twseconfig.copy_button_enabled;
      panel.debugLogs = twseconfig.debug_logs;
      panel.addEventListener("twse-save", (e2) => {
        const detail = e2.detail;
        twseconfig.apiKey = detail.apiKey;
        twseconfig.war_sorting = detail.warSorting;
        twseconfig.bubble_enabled = detail.bubbleEnabled;
        twseconfig.copy_button_enabled = detail.copyButtonEnabled;
        twseconfig.debug_logs = detail.debugLogs;
        log$5.info("Settings saved successfully");
        window.dispatchEvent(new CustomEvent("twse-config-updated"));
      });
      panel.addEventListener("twse-reset", () => {
        twseconfig.reset();
        panel.apiKey = twseconfig.apiKey;
        panel.warSorting = twseconfig.war_sorting;
        panel.bubbleEnabled = twseconfig.bubble_enabled;
        panel.copyButtonEnabled = twseconfig.copy_button_enabled;
        panel.debugLogs = twseconfig.debug_logs;
        log$5.info("Settings reset to defaults");
        window.dispatchEvent(new CustomEvent("twse-config-updated"));
      });
      panel.addEventListener("twse-save-key", (e2) => {
        const detail = e2.detail;
        twseconfig.apiKey = detail.apiKey;
        log$5.info("API key saved");
        window.dispatchEvent(new CustomEvent("twse-config-updated"));
      });
      panel.addEventListener("twse-clear-cache", () => {
        log$5.info("Settings cleared caching successfully");
        window.dispatchEvent(new CustomEvent("twse-clear-cache"));
      });
      factionsContainer.appendChild(panel);
      log$5.debug("Settings panel successfully appended to #factions container");
    }
  };
  const __vite_glob_0_1 = Object.freeze( Object.defineProperty({
    __proto__: null,
    default: SettingsFeature
  }, Symbol.toStringTag, { value: "Module" }));
  const log$4 = logger.child("api");
  class TornApiClient {
    constructor() {
      this.baseUrl = "https://api.torn.com/v2/faction";
    }
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
      const url = `${this.baseUrl}?id=${factionId}&selections=members,chain,timestamp&key=${key}&comment=TornWarStuffEnhanced`;
      try {
        const response = await fetch(url);
        if (!response.ok) {
          try {
            const errData = await response.json();
            log$4.error(
              `Torn API returned error code ${errData.code}: ${errData.error}`
            );
            return { error: errData };
          } catch {
            throw new Error(`HTTP Error status: ${response.status}`);
          }
        }
        const data = await response.json();
        return data;
      } catch (e2) {
        log$4.error(
          `Network or parse error fetching faction ${factionId} data:`,
          e2
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
  class BatchedDomWriter {
    constructor(config) {
      this.attrCache = new WeakMap();
      this.styleCache = new WeakMap();
      this.deferredWrites = [];
      this.deferredStyles = [];
      this.groupsByAttr = new Map();
      this.dirtyGroups = new Set();
      for (const [groupName, attrs] of Object.entries(config.groups)) {
        for (const attr of attrs) {
          let groups = this.groupsByAttr.get(attr);
          if (!groups) {
            groups = new Set();
            this.groupsByAttr.set(attr, groups);
          }
          groups.add(groupName);
        }
      }
    }
    setAttr(element, attr, value) {
      const cache = this.cacheFor(
        this.attrCache,
        element,
        attr,
        () => element.getAttribute(attr) ?? ""
      );
      if (cache[attr] === value) {
        return false;
      }
      cache[attr] = value;
      this.deferredWrites.push([element, attr, value]);
      for (const groupName of this.groupsByAttr.get(attr) ?? []) {
        this.dirtyGroups.add(groupName);
      }
      return true;
    }
    setStyle(element, prop, value) {
      const cache = this.cacheFor(
        this.styleCache,
        element,
        prop,
        () => element.style.getPropertyValue(prop)
      );
      if (cache[prop] === value) {
        return;
      }
      cache[prop] = value;
      this.deferredStyles.push([element, prop, value]);
    }


cacheFor(cacheMap, element, key, readLiveValue) {
      let cache = cacheMap.get(element);
      if (!cache) {
        cache = {};
        cacheMap.set(element, cache);
      }
      if (cache[key] === void 0) {
        cache[key] = readLiveValue();
      }
      return cache;
    }
    flush() {
      for (const [element, attr, value] of this.deferredWrites) {
        element.setAttribute(attr, value);
      }
      this.deferredWrites = [];
      for (const [element, prop, value] of this.deferredStyles) {
        element.style.setProperty(prop, value);
      }
      this.deferredStyles = [];
      const dirtyGroups = this.dirtyGroups;
      this.dirtyGroups = new Set();
      return dirtyGroups;
    }
  }
  const log$3 = logger.child("cache");
  const CACHE_VERSION = 1;
  class FactionCache {
    constructor() {
      this.prefix = "xentac-torn_war_stuff_enhanced-status-";
      this.ttlMs = 1e4;
    }

get(factionId) {
      try {
        const key = `${this.prefix}${factionId}`;
        const cacheStr = localStorage.getItem(key);
        if (!cacheStr) {
          return null;
        }
        const parsed = JSON.parse(cacheStr);
        if (!parsed || typeof parsed.timestamp !== "number" || !parsed.members || parsed.version !== CACHE_VERSION) {
          this.remove(factionId);
          return null;
        }
        const now = Date.now();
        if (now - parsed.timestamp > this.ttlMs) {
          this.remove(factionId);
          return null;
        }
        return parsed.members;
      } catch (e2) {
        log$3.error(`Error reading cached members for faction ${factionId}:`, e2);
        this.remove(factionId);
        return null;
      }
    }
set(factionId, members) {
      try {
        const key = `${this.prefix}${factionId}`;
        const cacheItem = {
          version: CACHE_VERSION,
          timestamp: Date.now(),
          members
        };
        localStorage.setItem(key, JSON.stringify(cacheItem));
      } catch (e2) {
        log$3.error(`Error caching members for faction ${factionId}:`, e2);
      }
    }
remove(factionId) {
      try {
        const key = `${this.prefix}${factionId}`;
        localStorage.removeItem(key);
      } catch (e2) {
        log$3.error(`Error removing cached status for faction ${factionId}:`, e2);
      }
    }
cleanExpired() {
      try {
        const now = Date.now();
        let cleanedCount = 0;
        for (let i2 = 0; i2 < localStorage.length; i2++) {
          const key = localStorage.key(i2);
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
              i2--;
            }
          } catch {
            localStorage.removeItem(key);
            cleanedCount++;
            i2--;
          }
        }
        if (cleanedCount > 0) {
          log$3.info(`Cleaned ${cleanedCount} expired cached statuses`);
        }
      } catch (e2) {
        log$3.error("Error sweeping expired cached statuses:", e2);
      }
    }
clearAll() {
      try {
        const keysToRemove = [];
        for (let i2 = 0; i2 < localStorage.length; i2++) {
          const key = localStorage.key(i2);
          if (key?.startsWith(this.prefix)) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => {
          localStorage.removeItem(key);
        });
        log$3.info(`Cleared all cached faction statuses`);
      } catch (e2) {
        log$3.error("Error clearing cached statuses:", e2);
      }
    }
  }
  const factionCache = new FactionCache();
  function getCurrentTime() {
    const w = window;
    if (typeof w.getCurrentTimestamp === "function") {
      try {
        return w.getCurrentTimestamp();
      } catch (_e) {
      }
    }
    return Date.now();
  }
  function pad_with_zeros(n3) {
    if (n3 < 10) {
      return `0${n3}`;
    }
    return String(n3);
  }
  function calc_delta(delta, include_seconds = true, pad_hour = true) {
    const s2 = Math.floor(delta % 60);
    const m2 = Math.floor(delta / 60 % 60);
    const h2 = Math.floor(delta / 60 / 60);
    const hour_minute = `${pad_hour ? pad_with_zeros(h2) : h2}:${pad_with_zeros(m2)}`;
    return hour_minute + (include_seconds ? `:${pad_with_zeros(s2)}` : "");
  }
  function formatChainTimeout(seconds) {
    const isNegative = seconds < 0;
    const absSeconds = Math.abs(seconds);
    const m2 = Math.floor(absSeconds / 60);
    const s2 = Math.floor(absSeconds % 60);
    return `${isNegative ? "-" : ""}${m2}:${pad_with_zeros(s2)}`;
  }
  function formatChainCooldown(seconds) {
    if (seconds <= 0) return "0:00";
    const s2 = Math.floor(seconds % 60);
    const m2 = Math.floor(seconds / 60 % 60);
    const h2 = Math.floor(seconds / 3600 % 24);
    const d2 = Math.floor(seconds / 86400);
    if (d2 > 0) return `${d2}d${h2}h`;
    if (h2 > 0) return `${h2}h${m2}m`;
    if (m2 >= 10) return `${m2}m`;
    return `${m2}:${pad_with_zeros(s2)}`;
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
  const log$2 = logger.child("twse-server");
  const TWSE_SERVER_BASE_URL = "https://twse.dev";
  const MIN_FETCH_INTERVAL_MS = 1e3;
  class TwseServerClient {
    constructor() {
      this.tabId = crypto.randomUUID();
      this.lastFetchTime = new Map();
    }
async fetchLatest(factionId) {
      const now = Date.now();
      const last = this.lastFetchTime.get(factionId) ?? 0;
      if (now - last < MIN_FETCH_INTERVAL_MS) return null;
      this.lastFetchTime.set(factionId, now);
      log$2.debug("Fetching latest from twse.dev");
      const start = performance.now();
      return new Promise((resolve) => {
        GM_xmlhttpRequest({
          method: "GET",
          url: `${TWSE_SERVER_BASE_URL}/faction/${factionId}`,
          onload: (response) => {
            if (response.status !== 200) {
              resolve(null);
              return;
            }
            try {
              const end = performance.now();
              log$2.debug(`Received result in ${end - start}ms`);
              resolve(JSON.parse(response.responseText));
            } catch (e2) {
              log$2.error(`Failed to parse response for faction ${factionId}:`, e2);
              resolve(null);
            }
          },
          onerror: (e2) => {
            log$2.debug(`Failed to fetch latest data for faction ${factionId}:`, e2);
            resolve(null);
          }
        });
      });
    }
submit(factionId, payload) {
      log$2.debug("Sending update to twse server");
      GM_xmlhttpRequest({
        method: "POST",
        url: `${TWSE_SERVER_BASE_URL}/faction/${factionId}/submit`,
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({ ...payload, tab_id: this.tabId }),
        onerror: (e2) => {
          log$2.error(
            `Failed to submit faction ${factionId} data to TWSE Server:`,
            e2
          );
        }
      });
    }
  }
  const twseClient = new TwseServerClient();
  const stylesCss = ".members-list li:has(div.status[data-twse-highlight=true]){background-color:#99eb99!important}:root.twse-window-focused .members-list li:has(div.status[data-twse-status-differs=true]){background-color:#c4974c!important}.members-list div.status[data-twse-traveling=true]:after{color:#696026!important}:root .dark-mode .members-list li:has(div.status[data-twse-highlight=true]){background-color:#446944!important}:root.twse-window-focused .dark-mode .members-list li:has(div.status[data-twse-status-differs=true]){background-color:#795315!important}:root .dark-mode .members-list div.status[data-twse-traveling=true]:after{color:#ffed76!important}.members-list div.status[data-twse-overridden=true]{position:relative!important;color:transparent!important}.members-list div.status[data-twse-overridden=true]:after{content:var(--twse-content);position:absolute;top:0;left:0;width:calc(100% - 10px);height:100%;background:inherit;display:flex;right:10px;justify-content:flex-end;align-items:center;white-space:nowrap!important}.members-list .ok.status:after{color:var(--user-status-green-color)}.members-list .not-ok.status:after{color:var(--user-status-red-color)}.members-list .abroad.status:after,.members-list .traveling.status:after{color:var(--user-status-blue-color)}.twse-sort-toggle-container{position:absolute;left:10px;display:inline-flex;align-items:center}.twse-sort-toggle-label{display:inline-flex;align-items:center;gap:6px;cursor:pointer;color:#999;font-size:13px;-webkit-user-select:none;user-select:none}.twse-sort-toggle-checkbox{cursor:pointer;margin:0;width:13px;height:13px}.members-list li .member{position:relative!important;display:flex!important;align-items:center}.twse-copy-btn{position:absolute;right:8px;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;justify-content:center;background:none;border:none;cursor:pointer;padding:4px;color:#888;transition:color .15s,background-color .15s,transform .1s;border-radius:4px;z-index:10}.twse-copy-btn:hover{color:#333;background-color:#0000000d}:root .dark-mode .twse-copy-btn:hover{color:#fff;background-color:#ffffff26}.twse-copy-btn:active{transform:translateY(-50%) scale(.9)}.twse-copy-btn.success{color:#494!important}:root .dark-mode .twse-copy-btn.success{color:#69eb69!important}.twse-chain-bubble{position:fixed;bottom:100px;right:20px;z-index:9999;background:#1e1e1ed9;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:6px 10px;box-shadow:0 8px 32px #0000005e;color:#e0e0e0;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:11px;line-height:1.5;display:flex;flex-direction:column;transition:opacity .3s ease,transform .3s ease;min-width:100px;pointer-events:auto;cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none!important}.twse-chain-bubble *{touch-action:none!important}.twse-chain-bubble.hidden{opacity:0;transform:translateY(10px);pointer-events:none}.twse-chain-body{display:flex;flex-direction:column;gap:4px;width:100%}.twse-chain-tag,.twse-chain-mult{display:none}.twse-chain-row{display:flex;justify-content:space-between;align-items:center;gap:12px}.twse-chain-stats{display:flex;align-items:center;gap:6px;width:100%}.twse-chain-count{font-weight:600;color:#fff}.twse-chain-timer{margin-left:auto;font-family:monospace;font-weight:700;padding:2px 6px;border-radius:4px;background:#0000004d}.twse-chain-timer.okay{color:#69eb69}.twse-chain-timer.cooldown{color:#64b5f6;background:#64b5f626}.twse-chain-count.cooldown{color:#64b5f6}.twse-chain-timer.negative{color:#ff5252}.twse-chain-timer.urgent{color:#ff5252;background:#ff525226;animation:twse-pulse 1s infinite alternate}@keyframes twse-pulse{0%{box-shadow:0 0 2px #ff525266}to{box-shadow:0 0 8px #ff5252cc}}body.twse-copy-disabled .twse-copy-btn,body.twse-bubble-disabled #twse-chain-bubble{display:none!important}body{--twse-bg-color: #f0f0f0;--twse-alt-bg-color: #fff;--twse-border-color: #ccc;--twse-input-color: #333;--twse-text-color: #000;--twse-hover-color: #ddd;--twse-glow-color: #4caf50;--twse-success-color: #4caf50}:root .dark-mode{--twse-bg-color: #333;--twse-alt-bg-color: #383838;--twse-border-color: #444;--twse-input-color: #ccc;--twse-text-color: #ccc;--twse-hover-color: #555;--twse-glow-color: #4caf50;--twse-success-color: #4caf50}twse-settings-panel{display:block;margin-top:20px;clear:both}twse-settings-panel .accordion{margin:10px 0;padding:15px;background-color:var(--twse-bg-color);border:1px solid var(--twse-border-color);border-radius:5px;color:var(--twse-text-color);font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif}twse-settings-panel .accordion.glow{border-color:var(--twse-glow-color);box-shadow:0 0 8px #4caf5080}twse-settings-panel .input-row{display:flex;flex-direction:column;gap:5px;margin-bottom:15px}twse-settings-panel .input-row-inline{display:flex;align-items:center;gap:10px;margin-bottom:15px;font-size:13px;cursor:pointer;-webkit-user-select:none;user-select:none}twse-settings-panel .input-row-inline input[type=checkbox]{cursor:pointer;width:14px;height:14px;margin:0}twse-settings-panel .input-row-inline label{cursor:pointer;line-height:1.4}twse-settings-panel .blur-mode{filter:blur(4px);transition:filter .2s ease}twse-settings-panel .blur-mode:hover,twse-settings-panel .blur-mode:focus{filter:blur(0)}twse-settings-panel input[type=text]{box-sizing:border-box;text-align:left;vertical-align:top;width:250px;height:34px;margin-right:8px;padding:8px 10px;line-height:14px;display:inline-block;border:1px solid var(--twse-border-color);border-radius:5px;background-color:var(--twse-alt-bg-color);color:var(--twse-text-color);outline:none}twse-settings-panel input[type=text]:focus{border-color:var(--twse-glow-color)}twse-settings-panel .twse-api-explanation{background-color:var(--twse-alt-bg-color);border:1px solid var(--twse-border-color);border-radius:8px;color:var(--twse-text-color);margin-top:5px;margin-bottom:5px;padding:10px 14px;font-size:12px;line-height:1.4;max-width:600px}twse-settings-panel h3{margin:20px 0 12px;font-size:14px;font-weight:700;border-bottom:1px solid var(--twse-border-color);padding-bottom:6px}";
  importCSS(stylesCss);
  var SortGroup = ((SortGroup2) => {
    SortGroup2["UnexpectedOkay"] = "UnexpectedOkay";
    SortGroup2["ExpectedOkay"] = "ExpectedOkay";
    SortGroup2["Hospitalized"] = "Hospitalized";
    SortGroup2["Incoming"] = "Incoming";
    SortGroup2["Abroad"] = "Abroad";
    SortGroup2["Outgoing"] = "Outgoing";
    SortGroup2["Traveling"] = "Traveling";
    return SortGroup2;
  })(SortGroup || {});
  function parseCanonicalStatus(statusDiv) {
    if (statusDiv.classList.contains("traveling") || statusDiv.classList.contains("abroad")) {
      return "Traveling";
    }
    if (statusDiv.classList.contains("hospital") || statusDiv.classList.contains("jail")) {
      return "HospitalOrJail";
    }
    if (statusDiv.textContent === "Okay") {
      return "Okay";
    }
    return "Unknown";
  }
  function classifyMember(status, canonicalStatus, transitionState, browserNow, tornNow, config) {
    let decision;
    if (status.state === "Hospital" || status.state === "Jail") {
      decision = classifyHospitalOrJail(
        status,
        canonicalStatus,
        transitionState,
        browserNow,
        tornNow,
        config.nearExpiryThresholdSec
      );
    } else if (status.state === "Traveling" || status.state === "Abroad") {
      decision = classifyTraveling(
        status,
        canonicalStatus,
        transitionState,
        browserNow
      );
    } else {
      decision = classifyOkay(transitionState, browserNow);
    }
    return {
      ...decision,
      isUnexpectedHighlighted: isUnexpectedHighlighted(
        decision.nextTransitionState,
        browserNow,
        config
      )
    };
  }
  function classifyOkay(transitionState, browserNow) {
    const sortGroup = carryForwardSortGroup(transitionState);
    const okaySince = sortGroup === "ExpectedOkay" && transitionState.okaySince === null ? browserNow : transitionState.okaySince;
    return {
      sortGroup,
      route: null,
      nextTransitionState: {
        unexpectedSince: transitionState.unexpectedSince,
        okaySince
      },
      isNearExpiry: false
    };
  }
  function classifyHospitalOrJail(status, canonicalStatus, transitionState, browserNow, tornNow, nearExpiryThresholdSec) {
    const timeRemainingSec = Math.round(
      (status.until ?? 0) - tornNow / 1e3
    );
    if (canonicalStatus === "HospitalOrJail") {
      return {
        sortGroup: "Hospitalized",
        route: null,
        nextTransitionState: { unexpectedSince: null, okaySince: null },
        isNearExpiry: timeRemainingSec > 0 && timeRemainingSec < nearExpiryThresholdSec
      };
    }
    if (timeRemainingSec >= 0) {
      return {
        sortGroup: "UnexpectedOkay",
        route: null,
        nextTransitionState: {
          unexpectedSince: transitionState.unexpectedSince ?? browserNow,
          okaySince: transitionState.okaySince
        },
        isNearExpiry: false
      };
    }
    return {
      sortGroup: "ExpectedOkay",
      route: null,
      nextTransitionState: {
        unexpectedSince: null,
        okaySince: (status.until ?? 0) * 1e3
      },
      isNearExpiry: false
    };
  }
  function classifyTraveling(status, canonicalStatus, transitionState, browserNow) {
    if (canonicalStatus === "Traveling") {
      const nextTransitionState = {
        unexpectedSince: null,
        okaySince: null
      };
      if (status.description.includes("In ")) {
        return {
          sortGroup: "Abroad",
          route: null,
          nextTransitionState,
          isNearExpiry: false
        };
      }
      const route = extract_destinations_from_description(status.description);
      if (route?.from === "TC") {
        return {
          sortGroup: "Outgoing",
          route,
          nextTransitionState,
          isNearExpiry: false
        };
      }
      if (route?.to === "TC") {
        return {
          sortGroup: "Incoming",
          route,
          nextTransitionState,
          isNearExpiry: false
        };
      }
      return {
        sortGroup: "Traveling",
        route: route ?? null,
        nextTransitionState,
        isNearExpiry: false
      };
    }
    if (canonicalStatus === "Okay") {
      return {
        sortGroup: "UnexpectedOkay",
        route: null,
        nextTransitionState: {
          unexpectedSince: transitionState.unexpectedSince ?? browserNow,
          okaySince: transitionState.okaySince
        },
        isNearExpiry: false
      };
    }
    return {
      sortGroup: carryForwardSortGroup(transitionState),
      route: null,
      nextTransitionState: transitionState,
      isNearExpiry: false
    };
  }
  function carryForwardSortGroup(transitionState) {
    return transitionState.unexpectedSince ? "UnexpectedOkay" : "ExpectedOkay";
  }
  function isUnexpectedHighlighted(transitionState, browserNow, config) {
    return transitionState.unexpectedSince !== null && browserNow - transitionState.unexpectedSince < config.unexpectedHighlightMs;
  }
  function getMemberLists() {
    return Array.from(document.querySelectorAll("ul.members-list"));
  }
  function getFactionIds() {
    const ids = [];
    for (const list of getMemberLists()) {
      const anchor = list.querySelector(
        "a[href^='/factions.php']"
      );
      if (!anchor) continue;
      const id = parseHrefParam(anchor, "ID");
      if (id) ids.push(id);
    }
    return ids;
  }
  function getMemberRows() {
    const rows = [];
    for (const list of getMemberLists()) {
      const lis = list.querySelectorAll("li.enemy, li.your");
      for (const li of Array.from(lis)) {
        const anchor = li.querySelector(
          "a[href^='/profiles.php']"
        );
        if (!anchor) continue;
        const id = parseHrefParam(anchor, "XID");
        if (!id) continue;
        rows.push({
          id,
          li,
          statusDiv: li.querySelector("div.status")
        });
      }
    }
    return rows;
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
    const order = column ? classname.includes("asc__") ? "asc" : "desc" : null;
    return { column, order };
  }
  function parseHrefParam(anchor, paramName) {
    try {
      return new URL(anchor.href, "https://www.torn.com").searchParams.get(
        paramName
      );
    } catch {
      return null;
    }
  }
  const log$1 = logger.child("feature:war-monitor");
  const TRAVELING = "data-twse-traveling";
  const HIGHLIGHT = "data-twse-highlight";
  const STATUS_DIFFERS = "data-twse-status-differs";
  function shouldRunMonitor() {
    if (!window.location.href.includes("factions.php")) {
      return false;
    }
    const hash = window.location.hash || "";
    if (!hash.startsWith("#/war/")) {
      return false;
    }
    return true;
  }
  const WarMonitorFeature = {
    name: "War Monitor",
    description: "Monitors active Faction wars, retrieves real-time member statuses, and decorates rows",
    executionTime: StartTime.DocumentEnd,
    intervals: {
      poll: 1e4,
      watch: 500,
      minTimeBetweenRequests: 1e4,
      unexpectedHighlight: 1e4,
      nearExpiryThresholdSec: 300
    },
    shouldRun() {
      return window.location.href.includes("factions.php");
    },
    async run() {
      let active = false;
      let stopMonitor = null;
      const isVisible = () => {
        return !document.hidden;
      };
      const isTornPda = () => typeof window !== "undefined" && !!window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function";
      const startMonitor = async () => {
        if (active) return;
        active = true;
        factionCache.cleanExpired();
        const syncBodyClasses = () => {
          document.body.classList.toggle(
            "twse-copy-disabled",
            !twseconfig.copy_button_enabled
          );
          document.body.classList.toggle(
            "twse-bubble-disabled",
            !twseconfig.bubble_enabled
          );
        };
        syncBodyClasses();
        let running = true;
        let foundWar = false;
        let pageVisible = isVisible();
        const onTornPda = isTornPda();
        let windowFocused = onTornPda ? !document.hidden : document.hasFocus();
        const updateWindowFocusClass = () => {
          document.documentElement.classList.toggle(
            "twse-window-focused",
            windowFocused
          );
        };
        updateWindowFocusClass();
        let everSorted = false;
        let ffscouterSortingDeferred = false;
        let forceSortNextTick = false;
        const members = new Map();
        const memberLis = new Map();
        const unexpectedTransitions = new Map();
        const okaySinceTimestamps = new Map();
        const domWriter = new BatchedDomWriter({
          groups: {
            sort: [
              "data-until",
              "data-player_id",
              "data-sortA",
              "data-location",
              "data-okay-since",
              "data-unexpected-at"
            ]
          }
        });
        const UNEXPECTED_HIGHLIGHT_MS = WarMonitorFeature.intervals.unexpectedHighlight;
        let lastRequestTime = 0;
        const minTimeBetweenRequestsMs = WarMonitorFeature.intervals.minTimeBetweenRequests;
        const activeChains = new Map();
        const lastAppliedTimestamp = new Map();
        let cachedUserIdHashKey = null;
        let cachedUserIdHash = null;
        let lastChainHtml = "";
        let isDragging = false;
        let _isSorting = false;
        const memberListObservers = [];
        const onConfigUpdated = () => {
          syncBodyClasses();
          const checkbox = document.querySelector(
            "#twse-war-sort-checkbox"
          );
          if (checkbox) {
            checkbox.checked = twseconfig.war_sorting;
          }
        };
        window.addEventListener("twse-config-updated", onConfigUpdated);
        const onClearCache = () => {
          log$1.info("Received twse-clear-cache event. Purging all caches.");
          members.clear();
          factionCache.clearAll();
          activeChains.clear();
          unexpectedTransitions.clear();
          okaySinceTimestamps.clear();
          lastAppliedTimestamp.clear();
          updateStatuses();
        };
        window.addEventListener("twse-clear-cache", onClearCache);
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
            const r2 = bubbleContainer.getBoundingClientRect();
            return {
              left: r2.left ?? 0,
              top: r2.top ?? 0,
              width: r2.width || 170,
              height: r2.height || 60
            };
          }
          return { left: 0, top: 0, width: 170, height: 60 };
        };
        const clampToScreen = () => {
          if (!bubbleContainer) return;
          const rect = getBubbleRect();
          const w = rect.width;
          const h2 = rect.height;
          const currentLeft = parseFloat(bubbleContainer.style.left);
          const currentTop = parseFloat(bubbleContainer.style.top);
          if (!Number.isNaN(currentLeft) && !Number.isNaN(currentTop)) {
            const maxLeft = window.innerWidth - w;
            const maxTop = window.innerHeight - h2;
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
          let startX = 0;
          let startY = 0;
          let initialX = 0;
          let initialY = 0;
          const dragStart = (e2) => {
            isDragging = true;
            const isTouch = e2.type === "touchstart";
            const touchEvent = e2;
            const mouseEvent = e2;
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
            if (isTouch) {
              e2.stopPropagation();
            }
            if (e2.cancelable) {
              e2.preventDefault();
            }
            window.getSelection()?.removeAllRanges();
            if (isTouch) {
              if (bubbleContainer) {
                bubbleContainer.addEventListener("touchmove", dragMove, {
                  passive: false
                });
                bubbleContainer.addEventListener("touchend", dragEnd);
                bubbleContainer.addEventListener("touchcancel", dragEnd);
              }
            } else {
              document.addEventListener("mousemove", dragMove);
              document.addEventListener("mouseup", dragEnd);
            }
          };
          const dragMove = (e2) => {
            if (!isDragging || !bubbleContainer) return;
            const isTouch = e2.type === "touchmove";
            if (isTouch) {
              e2.stopPropagation();
            }
            if (e2.cancelable) {
              e2.preventDefault();
            }
            const touchEvent = e2;
            const mouseEvent = e2;
            const clientX = isTouch && touchEvent.touches && touchEvent.touches.length > 0 ? touchEvent.touches[0].clientX : mouseEvent.clientX;
            const clientY = isTouch && touchEvent.touches && touchEvent.touches.length > 0 ? touchEvent.touches[0].clientY : mouseEvent.clientY;
            const dx = clientX - startX;
            const dy = clientY - startY;
            const rect = getBubbleRect();
            const w = rect.width;
            const h2 = rect.height;
            let newLeft = initialX + dx;
            let newTop = initialY + dy;
            const maxLeft = window.innerWidth - w;
            const maxTop = window.innerHeight - h2;
            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));
            bubbleContainer.style.bottom = "auto";
            bubbleContainer.style.right = "auto";
            bubbleContainer.style.left = `${newLeft}px`;
            bubbleContainer.style.top = `${newTop}px`;
          };
          const dragEnd = (e2) => {
            isDragging = false;
            if (e2 && (e2.type === "touchend" || e2.type === "touchcancel")) {
              e2.stopPropagation();
            }
            if (bubbleContainer) {
              bubbleContainer.style.cursor = "grab";
              const left = parseFloat(bubbleContainer.style.left) || 0;
              const top = parseFloat(bubbleContainer.style.top) || 0;
              twseconfig.bubble_position = { left, top };
              bubbleContainer.removeEventListener("touchmove", dragMove);
              bubbleContainer.removeEventListener("touchend", dragEnd);
              bubbleContainer.removeEventListener("touchcancel", dragEnd);
            }
            document.removeEventListener("mousemove", dragMove);
            document.removeEventListener("mouseup", dragEnd);
            updateChainBubble();
          };
          bubbleContainer.addEventListener("mousedown", dragStart);
          bubbleContainer.addEventListener("touchstart", dragStart, {
            passive: false
          });
        }
        const onVisibilityChange = () => {
          pageVisible = isVisible();
          if (onTornPda) {
            windowFocused = !document.hidden;
            updateWindowFocusClass();
          }
        };
        document.addEventListener("visibilitychange", onVisibilityChange);
        const onWindowFocus = () => {
          windowFocused = true;
          updateWindowFocusClass();
        };
        const onWindowBlur = () => {
          windowFocused = false;
          updateWindowFocusClass();
        };
        if (!onTornPda) {
          window.addEventListener("focus", onWindowFocus);
          window.addEventListener("blur", onWindowBlur);
        }
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
          copyBtn.addEventListener("click", async (e2) => {
            e2.preventDefault();
            e2.stopPropagation();
            const ariaMatch = atag.getAttribute("aria-label")?.match(/^View profile of (.+)$/);
            const name = ariaMatch ? ariaMatch[1].trim() : atag.textContent?.trim() || "";
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
          for (const row of getMemberRows()) {
            memberLis.set(row.id, { li: row.li, statusDiv: row.statusDiv });
            injectCopyButton(row.id, row.li);
          }
        }
        function populateCachedStatus(factionId) {
          const cached = factionCache.get(factionId);
          if (!cached) return;
          for (const [id, member] of Object.entries(cached)) {
            members.set(id, member);
          }
          log$1.info(
            `Populated war monitor cache with stored statuses for faction: ${factionId}`
          );
        }
        function sortMemberList(listElem) {
          let sortedColumn = getSortedColumn(listElem);
          if (sortedColumn.column && (sortedColumn.column !== "points" || sortedColumn.order !== "desc")) {
            everSorted = true;
          }
          if (!everSorted) {
            sortedColumn = { column: "status", order: "asc" };
          }
          if (listElem.getAttribute("data-ffscouter-active-filter") === "true") {
            ffscouterSortingDeferred = true;
            return;
          }
          if (sortedColumn.column !== "status") {
            return;
          }
          const lis = Array.from(listElem.childNodes);
          const validLis = lis.filter(
            (node) => node.nodeType === Node.ELEMENT_NODE
          );
          const sortedLis = validLis.sort((a2, b2) => {
            let left = a2;
            let right = b2;
            if (sortedColumn.order === "desc") {
              left = b2;
              right = a2;
            }
            const sorta = sort_by_attribute(left, right, "data-sortA", 1);
            const sortA_a = parseInt(left.getAttribute("data-sortA") || "1", 10);
            if (sorta !== 0) return sorta;
            const leftLocation = left.getAttribute("data-location") || "";
            const rightLocation = right.getAttribute("data-location") || "";
            if (leftLocation && rightLocation) {
              if (leftLocation < rightLocation) return -1;
              if (leftLocation > rightLocation) return 1;
              return 0;
            }
            if (sortA_a === 0) {
              return sort_by_attribute(left, right, "data-unexpected-at") * -1;
            }
            if (sortA_a === 1) {
              const okaysince = sort_by_attribute(left, right, "data-okay-since");
              if (okaysince === 0) {
                const est = sort_by_attribute(left, right, "data-est-value");
                if (est === 0) {
                  return sort_by_attribute(left, right, "data-player_id");
                }
                return est * -1;
              }
              return okaysince;
            }
            return sort_by_attribute(left, right, "data-until");
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
            for (const li of sortedLis) fragment.appendChild(li);
            listElem.appendChild(fragment);
          }
        }
        function setupMemberListObservers() {
          for (const obs of memberListObservers) obs.disconnect();
          memberListObservers.length = 0;
          const memberLists = getMemberLists();
          for (let i2 = 0; i2 < memberLists.length; i2++) {
            const ul = memberLists[i2];
            const obs = observeElement(
              ul,
              () => {
                if (_isSorting || !twseconfig.war_sorting) return;
                _isSorting = true;
                sortMemberList(ul);
                _isSorting = false;
              },
              { childList: true }
            );
            memberListObservers.push(obs);
          }
        }
        function calculateFlightTimeRemaining(li) {
          const earliestArrivalAttr = li.getAttribute("data-earliest-arrival");
          const latestArrivalAttr = li.getAttribute("data-latest-arrival");
          if (!earliestArrivalAttr && !latestArrivalAttr) return "";
          const earliestArrival = parseInt(
            earliestArrivalAttr || "",
            10
          );
          const latestArrival = parseInt(
            latestArrivalAttr || "",
            10
          );
          if (Number.isNaN(earliestArrival) && Number.isNaN(latestArrival))
            return "";
          const nowSec = getCurrentTime() / 1e3;
          if (!Number.isNaN(earliestArrival) && earliestArrival > nowSec) {
            const remaining = Math.round(earliestArrival - nowSec);
            return ` ${calc_delta(remaining, false, false)}`;
          }
          if (!Number.isNaN(latestArrival) && latestArrival > nowSec) {
            const remaining = Math.round(latestArrival - nowSec);
            return ` <${calc_delta(remaining, false, false)}`;
          }
          return " LATE";
        }
        async function getUserIdHash() {
          const key = twseconfig.apiKey;
          if (!key) return null;
          if (cachedUserIdHashKey === key) return cachedUserIdHash;
          const encoded = new TextEncoder().encode(key);
          const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
          const hash = Array.from(new Uint8Array(hashBuffer)).map((b2) => b2.toString(16).padStart(2, "0")).join("");
          cachedUserIdHashKey = key;
          cachedUserIdHash = hash;
          return hash;
        }
        function applyFactionData(factionId, data) {
          if (data.timestamp !== void 0) {
            const last = lastAppliedTimestamp.get(factionId) ?? 0;
            if (data.timestamp <= last) return;
            lastAppliedTimestamp.set(factionId, data.timestamp);
          }
          if (data.members) {
            const reqTime = Date.now();
            const factionMembers = {};
            for (const memberData of data.members) {
              const id = String(memberData.id);
              memberData.status.last_req_time = reqTime;
              members.set(id, memberData);
              factionMembers[id] = memberData;
            }
            factionCache.set(factionId, factionMembers);
          }
          if (data.chain) {
            activeChains.set(factionId, {
              current: data.chain.current,
              max: data.chain.max,
              timeout: data.chain.timeout,
              modifier: data.chain.modifier,
              apiReceivedAt: getCurrentTime(),
              cooldown: data.chain.cooldown || 0,
              end: data.chain.end
            });
          }
        }
        async function updateStatuses() {
          if (!running) return;
          const factionIds = getFactionIds();
          if (factionIds.length === 0) return;
          const now = Date.now();
          if (now - lastRequestTime < minTimeBetweenRequestsMs) return;
          lastRequestTime = now;
          const userIdHash = await getUserIdHash();
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
            applyFactionData(factionId, data);
            if (userIdHash !== null) {
              twseClient.submit(factionId, {
                user_id_hash: userIdHash,
                torn_response: data
              });
            }
          }
        }
        const SORT_GROUP_TO_SORT_A = {
          [SortGroup.UnexpectedOkay]: "0",
          [SortGroup.ExpectedOkay]: "1",
          [SortGroup.Hospitalized]: "2",
          [SortGroup.Incoming]: "3",
          [SortGroup.Abroad]: "4",
          [SortGroup.Outgoing]: "5",
          [SortGroup.Traveling]: "6"
        };
        function applyClassification(li, statusDiv, status, classification, tornNow) {
          domWriter.setAttr(
            li,
            "data-sortA",
            SORT_GROUP_TO_SORT_A[classification.sortGroup]
          );
          const isTravelState = status.state === "Traveling" || status.state === "Abroad";
          let dataLocation = "";
          let overridden = false;
          switch (classification.sortGroup) {
            case SortGroup.Abroad: {
              const content = shorten_destination(
                status.description.split("In ")[1]
              );
              dataLocation = content;
              domWriter.setStyle(statusDiv, "--twse-content", `"${content}"`);
              overridden = true;
              break;
            }
            case SortGroup.Outgoing: {
              if (classification.route) {
                dataLocation = `► ${classification.route.to}`;
                const remaining = calculateFlightTimeRemaining(li);
                domWriter.setStyle(
                  statusDiv,
                  "--twse-content",
                  `"${dataLocation}${remaining}"`
                );
                overridden = true;
              }
              break;
            }
            case SortGroup.Incoming: {
              if (classification.route) {
                dataLocation = `◄ ${classification.route.from}`;
                const remaining = calculateFlightTimeRemaining(li);
                domWriter.setStyle(
                  statusDiv,
                  "--twse-content",
                  `"${dataLocation}${remaining}"`
                );
                overridden = true;
              }
              break;
            }
            case SortGroup.Traveling: {
              if (isTravelState) {
                dataLocation = "Traveling";
                domWriter.setStyle(
                  statusDiv,
                  "--twse-content",
                  `"${dataLocation}"`
                );
                overridden = true;
              }
              break;
            }
            case SortGroup.Hospitalized: {
              const timeRemaining = Math.round(
                (status.until ?? 0) - tornNow / 1e3
              );
              if (timeRemaining > 0) {
                const timeStr = calc_delta(timeRemaining);
                domWriter.setStyle(statusDiv, "--twse-content", `"${timeStr}"`);
                overridden = true;
              }
              break;
            }
          }
          domWriter.setAttr(li, "data-location", dataLocation);
          const okaySince = classification.nextTransitionState.okaySince;
          domWriter.setAttr(
            li,
            "data-okay-since",
            okaySince === null ? "" : String(okaySince)
          );
          const unexpectedAt = classification.nextTransitionState.unexpectedSince ?? 0;
          domWriter.setAttr(li, "data-unexpected-at", String(unexpectedAt));
          domWriter.setAttr(
            statusDiv,
            STATUS_DIFFERS,
            classification.isUnexpectedHighlighted ? "true" : "false"
          );
          if (!isTravelState) {
            if (classification.sortGroup === SortGroup.Hospitalized) {
              domWriter.setAttr(
                statusDiv,
                TRAVELING,
                status.description.includes("In a") ? "true" : "false"
              );
            } else {
              domWriter.setAttr(statusDiv, TRAVELING, "false");
            }
            domWriter.setAttr(
              statusDiv,
              HIGHLIGHT,
              classification.isNearExpiry ? "true" : "false"
            );
          }
          domWriter.setAttr(
            statusDiv,
            "data-twse-overridden",
            overridden ? "true" : "false"
          );
        }
        function watch() {
          memberLis.forEach((elem, id) => {
            const li = elem.li;
            const statusDiv = elem.statusDiv;
            if (!li || !statusDiv) return;
            const member = members.get(id);
            if (!member || !running) {
              domWriter.setAttr(statusDiv, "data-twse-overridden", "false");
              return;
            }
            const status = member.status;
            domWriter.setAttr(li, "data-until", String(status.until ?? 0));
            domWriter.setAttr(li, "data-player_id", String(id));
            domWriter.setAttr(
              li,
              "data-twse-last-action-timestamp",
              String(member.last_action?.timestamp ?? 0)
            );
            const canonicalStatus = parseCanonicalStatus(statusDiv);
            const transitionState = {
              unexpectedSince: unexpectedTransitions.get(id) ?? null,
              okaySince: okaySinceTimestamps.get(id) ?? null
            };
            const browserNow = Date.now();
            const tornNow = getCurrentTime();
            const classification = classifyMember(
              status,
              canonicalStatus,
              transitionState,
              browserNow,
              tornNow,
              {
                unexpectedHighlightMs: UNEXPECTED_HIGHLIGHT_MS,
                nearExpiryThresholdSec: WarMonitorFeature.intervals.nearExpiryThresholdSec
              }
            );
            if (classification.nextTransitionState.unexpectedSince === null) {
              unexpectedTransitions.delete(id);
            } else {
              unexpectedTransitions.set(
                id,
                classification.nextTransitionState.unexpectedSince
              );
            }
            if (classification.nextTransitionState.okaySince === null) {
              okaySinceTimestamps.delete(id);
            } else {
              okaySinceTimestamps.set(
                id,
                classification.nextTransitionState.okaySince
              );
            }
            applyClassification(li, statusDiv, status, classification, tornNow);
          });
          const dirtyGroups = domWriter.flush();
          if (twseconfig.war_sorting && (dirtyGroups.has("sort") || forceSortNextTick)) {
            forceSortNextTick = false;
            _isSorting = true;
            const memberLists = getMemberLists();
            for (let i2 = 0; i2 < memberLists.length; i2++) {
              sortMemberList(memberLists[i2]);
            }
            _isSorting = false;
          }
          if (ffscouterSortingDeferred) {
            const memberLists = getMemberLists();
            let activeFilterFound = false;
            for (let i2 = 0; i2 < memberLists.length; i2++) {
              if (memberLists[i2].getAttribute("data-ffscouter-active-filter") === "true") {
                activeFilterFound = true;
                break;
              }
            }
            if (!activeFilterFound) {
              ffscouterSortingDeferred = false;
              forceSortNextTick = true;
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
          if (!bubbleContainer || isDragging) return;
          if (!foundWar || activeChains.size === 0) {
            bubbleContainer.classList.add("hidden");
            lastChainHtml = "";
            return;
          }
          const bodyContainer = bubbleContainer.querySelector(".twse-chain-body");
          if (!bodyContainer) return;
          let html = "";
          const nowSec = getCurrentTime() / 1e3;
          activeChains.forEach((chain) => {
            let formattedTime = "";
            let timerClass = "okay";
            let countClass = "";
            if (chain.cooldown > 0) {
              const remainingCooldown = Math.max(
                0,
                chain.cooldown - nowSec
              );
              formattedTime = formatChainCooldown(remainingCooldown);
              timerClass = "cooldown";
              countClass = "cooldown";
            } else if (chain.current === 0 || !chain.end || chain.end === 0) {
              formattedTime = "-:--";
              timerClass = "okay";
            } else {
              const remaining = chain.end - nowSec;
              if (remaining < 0) {
                formattedTime = formatChainTimeout(remaining);
                timerClass = "negative";
              } else if (remaining < 60) {
                formattedTime = formatChainTimeout(remaining);
                timerClass = "urgent";
              } else {
                formattedTime = formatChainTimeout(remaining);
              }
            }
            html += `
            <div class="twse-chain-row">
              <div class="twse-chain-stats">
                <span class="twse-chain-count ${countClass}">${chain.current}/${chain.max}</span>
                <span class="twse-chain-mult">${chain.modifier.toFixed(2)}x</span>
                <span class="twse-chain-timer ${timerClass}">${formattedTime}</span>
              </div>
            </div>
          `;
          });
          if (lastChainHtml !== html) {
            bodyContainer.innerHTML = html;
            lastChainHtml = html;
          }
          bubbleContainer.classList.remove("hidden");
        }
        let descriptionsObserver = null;
        let innerDescriptionsObserver = null;
        const initWarMonitoring = (descriptions) => {
          foundWar = false;
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
            graphContainer.parentNode.insertBefore(
              toggleContainer,
              graphContainer
            );
            log$1.info(
              "Successfully injected war sorting toggle checkbox before Graph link."
            );
            injectedToggle = true;
            const checkbox = toggleContainer.querySelector(
              "#twse-war-sort-checkbox"
            );
            if (checkbox) {
              checkbox.addEventListener("change", (e2) => {
                const isChecked = e2.target.checked;
                log$1.info(`War sorting configuration changed: ${isChecked}`);
                twseconfig.war_sorting = isChecked;
              });
            }
          };
          injectSortingToggle(descriptions);
          innerDescriptionsObserver = observeElement(descriptions, () => {
            if (!injectedToggle) {
              injectSortingToggle(descriptions);
            }
            if (!foundWar && descriptions.querySelector(".faction-war")) {
              foundWar = true;
              extractAllMemberLis();
              setupMemberListObservers();
              const ids = getFactionIds();
              ids.forEach(populateCachedStatus);
              updateStatuses();
            }
            if (foundWar && injectedToggle) {
              log$1.info(
                "Active war detected and toggle injected. Disconnecting innerDescriptionsObserver."
              );
              innerDescriptionsObserver?.disconnect();
              innerDescriptionsObserver = null;
            }
          });
          if (descriptions.querySelector(".faction-war")) {
            foundWar = true;
            extractAllMemberLis();
            setupMemberListObservers();
            const ids = getFactionIds();
            ids.forEach(populateCachedStatus);
            updateStatuses();
            if (injectedToggle) {
              log$1.info(
                "Active war detected at start and toggle injected. Disconnecting innerDescriptionsObserver."
              );
              innerDescriptionsObserver?.disconnect();
              innerDescriptionsObserver = null;
            }
          }
        };
        const factWarList = await waitForElement("#faction_war_list_id");
        if (!active) return;
        if (factWarList) {
          descriptionsObserver = new MutationObserver((mutations) => {
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
        const pollingInterval = setInterval(() => {
          if (running && foundWar) {
            updateStatuses();
          }
        }, WarMonitorFeature.intervals.poll);
        const watchInterval = setInterval(() => {
          pageVisible = isVisible();
          if (foundWar && running && pageVisible) {
            watch();
          }
        }, WarMonitorFeature.intervals.watch);
        let cacheTimer = null;
        const queryCache = async () => {
          if (cacheTimer) {
            clearTimeout(cacheTimer);
          }
          cacheTimer = null;
          try {
            if (!running || !foundWar) return;
            for (const factionId of getFactionIds()) {
              const data = await twseClient.fetchLatest(factionId);
              if (data) applyFactionData(factionId, data);
            }
          } finally {
            if (!cacheTimer) {
              cacheTimer = setTimeout(queryCache, 1e3);
            }
          }
        };
        queryCache();
        stopMonitor = () => {
          active = false;
          running = false;
          clearInterval(pollingInterval);
          clearInterval(watchInterval);
          if (cacheTimer) {
            clearTimeout(cacheTimer);
            cacheTimer = null;
          }
          if (descriptionsObserver) {
            descriptionsObserver.disconnect();
          }
          if (innerDescriptionsObserver) {
            innerDescriptionsObserver.disconnect();
          }
          for (const obs of memberListObservers) obs.disconnect();
          memberListObservers.length = 0;
          window.removeEventListener("twse-config-updated", onConfigUpdated);
          window.removeEventListener("twse-clear-cache", onClearCache);
          window.removeEventListener("resize", clampToScreen);
          document.removeEventListener("visibilitychange", onVisibilityChange);
          if (!onTornPda) {
            window.removeEventListener("focus", onWindowFocus);
            window.removeEventListener("blur", onWindowBlur);
          }
          if (bubbleContainer) {
            bubbleContainer.remove();
            bubbleContainer = null;
          }
          document.querySelector(".twse-sort-toggle-container")?.remove();
        };
      };
      const handleNavigation = () => {
        const shouldRun = shouldRunMonitor();
        if (shouldRun) {
          if (stopMonitor) {
            stopMonitor();
            stopMonitor = null;
          }
          startMonitor();
        } else if (!shouldRun && active) {
          if (stopMonitor) {
            stopMonitor();
            stopMonitor = null;
          }
        }
      };
      on_navigation(handleNavigation);
      if (shouldRunMonitor()) {
        startMonitor();
      }
      window.dispatchEvent(new Event("FFScouterV2DisableWarMonitor"));
    }
  };
  const __vite_glob_0_2 = Object.freeze( Object.defineProperty({
    __proto__: null,
    default: WarMonitorFeature
  }, Symbol.toStringTag, { value: "Module" }));
  const modules = Object.assign({
    "./key-manager/index.ts": __vite_glob_0_0,
    "./settings/index.ts": __vite_glob_0_1,
    "./war-monitor/index.ts": __vite_glob_0_2
  });
  const Features = Object.values(modules).map((mod) => mod.default).filter((feat) => !!feat && "name" in feat);
  const log = logger.child("boot");
  const INJECTION_KEY = "data-twse-injected";
  async function boot() {
    if (document.documentElement.hasAttribute(INJECTION_KEY)) {
      log.info("Script already injected, skipping boot.");
      return;
    }
    document.documentElement.setAttribute(INJECTION_KEY, "true");
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
      } catch (e2) {
        log.error(`Error running feature '${feature.name}':`, e2);
      }
    }
  }
  boot();

})();