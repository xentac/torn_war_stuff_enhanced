import { Features } from "./features";
import { StartTime } from "./features/feature";
import logger from "./utils/logger";

const log = logger.child("boot");

// A `window` flag is not reliable here: userscript managers can inject into a
// different realm/global than the page's own `window`, so two injections of this
// script may not see the same `window`. `document.documentElement` is the one thing
// every injection into the same actual page genuinely shares.
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
            childList: true,
          });

          // Fallback to DOMContentLoaded
          document.addEventListener("DOMContentLoaded", trigger);
        }
      } else {
        // DocumentEnd
        if (
          document.readyState === "complete" ||
          document.readyState === "interactive"
        ) {
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
