import logger from "./logger";

const log = logger.child("dom");

/**
 * Waits for a DOM element matching a selector to be present in the document.
 * Leverages a MutationObserver for maximum responsiveness.
 */
export function waitForElement<T extends Element>(
  selector: string,
  timeoutMs = 15_000,
): Promise<T | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector<T>(selector);
    if (existing) {
      return resolve(existing);
    }

    const observer = new MutationObserver((_, obs) => {
      const el = document.querySelector<T>(selector);
      if (el) {
        obs.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    if (timeoutMs > 0) {
      setTimeout(() => {
        observer.disconnect();
        log.debug(`Timeout waiting for element selector: '${selector}'`);
        resolve(null);
      }, timeoutMs);
    }
  });
}

/**
 * Creates and starts a MutationObserver on a target node.
 * Automatically disconnects and cleans up resources if the target node is no longer connected to the DOM.
 */
export function observeElement(
  target: Node,
  callback: MutationCallback,
  options: MutationObserverInit = { childList: true, subtree: true },
): MutationObserver {
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
  }, 10_000); // Poll every 10 seconds to detect detached DOM subtrees

  function cleanup() {
    clearInterval(intervalId);
    observer.disconnect();
  }

  // Override standard disconnect method to ensure the interval is always cleared
  const originalDisconnect = observer.disconnect.bind(observer);
  observer.disconnect = () => {
    clearInterval(intervalId);
    originalDisconnect();
  };

  observer.observe(target, options);
  return observer;
}

/**
 * Safe utility to inject a CSS block into the head of the page.
 */
export function injectStyles(css: string, id?: string): HTMLStyleElement {
  if (id) {
    const existing = document.getElementById(id);
    if (existing) {
      return existing as HTMLStyleElement;
    }
  }

  const style = document.createElement("style");
  if (id) {
    style.id = id;
  }
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
  return style;
}

export type TornPageParams = {
  sid?: string;
  step?: string;
  page?: string;
};

/**
 * Checks if the current page URL matches the specified page name, step and hash array parameters.
 */
export function torn_page(
  page: string,
  params: TornPageParams = {},
  match_hash: string[] = [],
) {
  const url_match =
    window.location.href.startsWith(`https://www.torn.com/${page}.php`) ||
    window.location.href.includes(`/${page}.php`);
  if (!url_match) {
    return false;
  }

  const search = new URLSearchParams(window.location.search);
  let sid_match = true;
  let step_match = true;
  if (params.sid) {
    const page_sid = search.get("sid");
    sid_match = page_sid !== null && params.sid === page_sid;
  }
  if (params.step) {
    const page_step = search.get("step");
    step_match = page_step !== null && params.step === page_step;
  }

  if (!sid_match || !step_match) {
    return false;
  }

  let hash_match = false;
  if (match_hash.length === 0) {
    hash_match = true;
  } else {
    const hash = window.location.hash;
    for (const h of match_hash) {
      if (hash === h) {
        hash_match = true;
        break;
      }
    }
  }

  return sid_match && step_match && hash_match;
}

/**
 * Registers a callback for page navigation events (SPA hash/anchor changes and history pops).
 * Automatically delays callback execution using setTimeout to ensure window.location is fully updated.
 * Returns a cleanup function to remove all registered listeners.
 */
export function on_navigation(callback: () => void): () => void {
  // Modern Navigation API (Chromium)
  const nav = (window as any).navigation;
  if (nav) {
    nav.addEventListener("currententrychange", callback);
    return () => {
      nav.removeEventListener("currententrychange", callback);
    };
  }

  const delayedCallback = () => {
    setTimeout(callback, 0);
  };

  // Fallbacks for Firefox, Safari, and other environments
  window.addEventListener("popstate", delayedCallback);
  window.addEventListener("hashchange", delayedCallback);

  return () => {
    window.removeEventListener("popstate", delayedCallback);
    window.removeEventListener("hashchange", delayedCallback);
  };
}

/**
 * Returns > 0 if a's attribute value is greater than b's attribute value, when converted to an int
 * Reurns < 0 if a's attribute value is less than b's
 * Returns 0 if equal
 */
export function sort_by_attribute(
  a: HTMLElement,
  b: HTMLElement,
  attr: string,
  d: number = 0,
) {
  const left = parseInt(a.getAttribute(attr) || `${d}`, 10);
  const right = parseInt(b.getAttribute(attr) || `${d}`, 10);
  return left - right;
}
