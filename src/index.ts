import { Features } from "./features";
import { StartTime } from "./features/feature";
import logger from "./utils/logger";

async function boot() {
  logger.info("Initializing Torn War Stuff Enhanced...");

  for (const feature of Features) {
    try {
      const shouldRun = await feature.shouldRun();
      if (!shouldRun) {
        continue;
      }

      logger.debug(`Booting feature: '${feature.name}'`);

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
      logger.error(`Error running feature '${feature.name}':`, e);
    }
  }
}

boot();
