import logger, { LogLevel } from "./logger";
import { Storage } from "./storage";

enum CONFIG_KEYS {
  API_KEY = "apikey",
  DEBUG_LOGS = "debug_logs",
  WAR_SORTING = "war_sorting",
  BUBBLE_POSITION = "bubble_position",
  BUBBLE_MINIMIZED = "bubble_minimized",
  BUBBLE_ENABLED = "bubble_enabled",
  COPY_BUTTON_ENABLED = "copy_button_enabled",
}

export class Config {
  private storage: Storage;
  private legacyPrefix = "xentac-torn_war_stuff_enhanced-";

  constructor(prefix = "twse-config-") {
    this.storage = new Storage(prefix);
    // Initialize the logger level dynamically from the stored configuration
    logger.setLevel(this.debug_logs ? LogLevel.DEBUG : LogLevel.INFO);
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
    logger.setLevel(val ? LogLevel.DEBUG : LogLevel.INFO);
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
   * Gets the stored draggable position of the floating bubble.
   */
  get bubble_position(): { left: number; top: number } | null {
    return (
      this.storage.get<{ left: number; top: number }>(
        CONFIG_KEYS.BUBBLE_POSITION,
      ) ?? null
    );
  }

  set bubble_position(val: { left: number; top: number } | null) {
    if (val === null) {
      this.storage.remove(CONFIG_KEYS.BUBBLE_POSITION);
    } else {
      this.storage.set(CONFIG_KEYS.BUBBLE_POSITION, val);
    }
  }

  /**
   * Gets the stored minimized state of the floating bubble.
   */
  get bubble_minimized(): boolean {
    return this.storage.get<boolean>(CONFIG_KEYS.BUBBLE_MINIMIZED) ?? false;
  }

  set bubble_minimized(val: boolean) {
    this.storage.set(CONFIG_KEYS.BUBBLE_MINIMIZED, val);
  }

  /**
   * Checks whether the chain bubble is enabled/visible.
   */
  get bubble_enabled(): boolean {
    return this.storage.get<boolean>(CONFIG_KEYS.BUBBLE_ENABLED) ?? true;
  }

  set bubble_enabled(val: boolean) {
    this.storage.set(CONFIG_KEYS.BUBBLE_ENABLED, val);
  }

  /**
   * Checks whether the player name copy to clipboard button is enabled.
   */
  get copy_button_enabled(): boolean {
    return this.storage.get<boolean>(CONFIG_KEYS.COPY_BUTTON_ENABLED) ?? true;
  }

  set copy_button_enabled(val: boolean) {
    this.storage.set(CONFIG_KEYS.COPY_BUTTON_ENABLED, val);
  }

  /**
   * Resets all configurations except API key.
   */
  public reset(): void {
    this.storage.remove(CONFIG_KEYS.DEBUG_LOGS);
    this.storage.remove(CONFIG_KEYS.WAR_SORTING);
    this.storage.remove(CONFIG_KEYS.BUBBLE_POSITION);
    this.storage.remove(CONFIG_KEYS.BUBBLE_MINIMIZED);
    this.storage.remove(CONFIG_KEYS.BUBBLE_ENABLED);
    this.storage.remove(CONFIG_KEYS.COPY_BUTTON_ENABLED);
  }
}

export const twseconfig = new Config();
