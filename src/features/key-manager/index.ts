import { Feature, StartTime } from "../feature";
import { twseconfig } from "@utils/config";
import logger from "@utils/logger";

const KeyManagerFeature: Feature = {
  name: "Key Manager",
  description: "Allows the user to register their Torn API key via a Tampermonkey menu command",
  executionTime: StartTime.DocumentEnd,

  shouldRun(): boolean {
    return true; // Always register the menu command
  },

  run(): void {
    if (typeof GM_registerMenuCommand !== "undefined") {
      GM_registerMenuCommand("Torn War Stuff: Register Key", () => {
        const defaultPrompt = twseconfig.apiKey;

        const key = prompt("Please enter a Torn API Key:", defaultPrompt);
        if (key !== null) {
          const trimmedKey = key.trim();
          if (trimmedKey.length === 16 || trimmedKey === "") {
            twseconfig.apiKey = trimmedKey;
            logger.info("Successfully updated API Key registration");
            alert("Torn API key registered successfully!");
          } else {
            alert("Invalid key! A Torn API key must be exactly 16 characters.");
          }
        }
      });
      logger.debug("Tampermonkey menu command 'Register Key' initialized");
    } else {
      logger.warn("GM_registerMenuCommand is not available in this context.");
    }
  },
};

export default KeyManagerFeature;
