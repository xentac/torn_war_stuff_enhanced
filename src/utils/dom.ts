import logger from "./logger";

/**
 * Waits for a DOM element matching a selector to be present in the document.
 * Leverages a MutationObserver for maximum responsiveness.
 */
export function waitForElement<T extends Element>(
  selector: string,
  timeoutMs = 15_000
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
        logger.debug(`Timeout waiting for element selector: '${selector}'`);
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
  options: MutationObserverInit = { childList: true, subtree: true }
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
