import { Storage } from "./storage";

enum CONFIG_KEYS {
  API_KEY = "apikey",
  DEBUG_LOGS = "debug_logs",
  WAR_SORTING = "war_sorting",
}

export class Config {
  private storage: Storage;
  private legacyPrefix = "xentac-torn_war_stuff_enhanced-";

  constructor(prefix = "twse-config-") {
    this.storage = new Storage(prefix);
  }

  /**
   * Gets the stored public API key.
   * Leverages fallback mechanisms for older userscript installations and PDA-APIKEY injection.
   */
  get apiKey(): string {
    // 1. Check modern Storage utility
    const key = this.storage.get<string>(CONFIG_KEYS.API_KEY);
    if (key) {
      return key;
    }

    // 2. Check legacy localStorage key for seamless backward-compatibility
    const legacyKey = localStorage.getItem(`${this.legacyPrefix}apikey`);
    if (legacyKey) {
      return legacyKey;
    }

    return "";
  }

  /**
   * Sets the API key.
   */
  set apiKey(val: string) {
    // Write both to new storage and legacy localStorage to ensure backward-compatibility
    this.storage.set(CONFIG_KEYS.API_KEY, val);
    localStorage.setItem(`${this.legacyPrefix}apikey`, val);
  }

  /**
   * Checks whether debug logs are enabled.
   */
  get debug_logs(): boolean {
    return this.storage.get<boolean>(CONFIG_KEYS.DEBUG_LOGS) ?? false;
  }

  set debug_logs(val: boolean) {
    this.storage.set(CONFIG_KEYS.DEBUG_LOGS, val);
  }

  /**
   * Checks whether sorting on the war page is enabled for both sides.
   */
  get war_sorting(): boolean {
    return this.storage.get<boolean>(CONFIG_KEYS.WAR_SORTING) ?? true;
  }

  set war_sorting(val: boolean) {
    this.storage.set(CONFIG_KEYS.WAR_SORTING, val);
  }

  /**
   * Resets all configurations except API key.
   */
  public reset(): void {
    this.storage.remove(CONFIG_KEYS.DEBUG_LOGS);
    this.storage.remove(CONFIG_KEYS.WAR_SORTING);
  }
}

export const twseconfig = new Config();
