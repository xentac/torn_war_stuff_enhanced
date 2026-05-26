import { twseconfig } from "@utils/config";
import { waitForElement } from "@utils/dom";
import logger from "@utils/logger";
import { type Feature, StartTime } from "../feature";
import "@ui/settings-panel";

const log = logger.child("feature:settings");

const SettingsFeature: Feature = {
  name: "Settings",
  description:
    "Renders and handles the settings panel at the bottom of the faction page",
  executionTime: StartTime.DocumentEnd,

  shouldRun(): boolean {
    return window.location.href.includes("factions.php");
  },

  async run(): Promise<void> {
    // 1. Wait for #factions element at the bottom of the page
    const factionsContainer = await waitForElement<HTMLElement>("#factions");
    if (!factionsContainer) {
      log.warn("Failed to find #factions element to append settings panel");
      return;
    }

    // 2. Instantiate settings panel
    const panel = document.createElement("twse-settings-panel");

    // 3. Inject config values into panel properties
    panel.apiKey = twseconfig.apiKey;
    panel.warSorting = twseconfig.war_sorting;
    panel.bubbleEnabled = twseconfig.bubble_enabled;
    panel.copyButtonEnabled = twseconfig.copy_button_enabled;
    panel.debugLogs = twseconfig.debug_logs;

    // 4. Set up event listener for Save
    panel.addEventListener("twse-save", (e: Event) => {
      const detail = (e as CustomEvent).detail;
      twseconfig.apiKey = detail.apiKey;
      twseconfig.war_sorting = detail.warSorting;
      twseconfig.bubble_enabled = detail.bubbleEnabled;
      twseconfig.copy_button_enabled = detail.copyButtonEnabled;
      twseconfig.debug_logs = detail.debugLogs;

      log.info("Settings saved successfully");

      // Dispatch config updated event
      window.dispatchEvent(new CustomEvent("twse-config-updated"));
    });

    // 5. Set up event listener for Reset
    panel.addEventListener("twse-reset", () => {
      twseconfig.reset();

      // Reset panel properties to reflect defaults
      panel.apiKey = twseconfig.apiKey;
      panel.warSorting = twseconfig.war_sorting;
      panel.bubbleEnabled = twseconfig.bubble_enabled;
      panel.copyButtonEnabled = twseconfig.copy_button_enabled;
      panel.debugLogs = twseconfig.debug_logs;

      log.info("Settings reset to defaults");

      // Dispatch config updated event
      window.dispatchEvent(new CustomEvent("twse-config-updated"));
    });

    // 6. Set up event listener for Clear Cache
    panel.addEventListener("twse-clear-cache", () => {
      log.info("Settings cleared caching successfully");
      window.dispatchEvent(new CustomEvent("twse-clear-cache"));
    });

    // 7. Append panel inside #factions container (at the bottom)
    factionsContainer.appendChild(panel);
    log.debug("Settings panel successfully appended to #factions container");
  },
};

export default SettingsFeature;
