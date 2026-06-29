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

    // 6. Set up event listener for API key auto-save
    panel.addEventListener("twse-save-key", (e: Event) => {
      const detail = (e as CustomEvent).detail;
      twseconfig.apiKey = detail.apiKey;
      log.info("API key saved");
      window.dispatchEvent(new CustomEvent("twse-config-updated"));
    });

    // 7. Set up event listener for Clear Cache
    panel.addEventListener("twse-clear-cache", () => {
      log.info("Settings cleared caching successfully");
      window.dispatchEvent(new CustomEvent("twse-clear-cache"));
    });

    // 8. Handle dynamic mounting based on presence of #faction_war_list_id
    const checkAndMount = () => {
      const warList = document.getElementById("faction_war_list_id");
      if (warList) {
        if (panel.previousSibling !== warList) {
          warList.after(panel);
          log.debug(
            "Settings panel successfully placed after #faction_war_list_id",
          );
        }
      } else {
        panel.remove();
      }
    };

    // Set up MutationObserver to detect tab changes/DOM swaps inside #factions
    const observer = new MutationObserver(checkAndMount);
    observer.observe(factionsContainer, {
      childList: true,
      subtree: true,
    });

    // Initial check
    checkAndMount();
  },
};

export default SettingsFeature;
