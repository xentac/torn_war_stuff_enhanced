import logger from "./logger";
import type { FactionMemberStatus } from "./types";

const log = logger.child("cache");

export class FactionCache {
  private prefix = "xentac-torn_war_stuff_enhanced-status-";
  private ttlMs = 10_000; // 10 seconds TTL

  /**
   * Retrieves the cached status for a faction.
   */
  public get(factionId: string): Record<string, FactionMemberStatus> | null {
    try {
      const key = `${this.prefix}${factionId}`;
      const cacheStr = localStorage.getItem(key);
      if (!cacheStr) {
        return null;
      }

      const parsed = JSON.parse(cacheStr);
      if (!parsed || typeof parsed.timestamp !== "number" || !parsed.status) {
        this.remove(factionId);
        return null;
      }

      const now = Date.now();
      if (now - parsed.timestamp > this.ttlMs) {
        this.remove(factionId);
        return null;
      }

      return parsed.status as Record<string, FactionMemberStatus>;
    } catch (e) {
      log.error(`Error reading cached status for faction ${factionId}:`, e);
      this.remove(factionId);
      return null;
    }
  }

  /**
   * Caches the status for a faction.
   */
  public set(
    factionId: string,
    status: Record<string, FactionMemberStatus>,
  ): void {
    try {
      const key = `${this.prefix}${factionId}`;
      const cacheItem = {
        timestamp: Date.now(),
        status,
      };
      localStorage.setItem(key, JSON.stringify(cacheItem));
    } catch (e) {
      log.error(`Error caching status for faction ${factionId}:`, e);
    }
  }

  /**
   * Removes cached status for a faction.
   */
  public remove(factionId: string): void {
    try {
      const key = `${this.prefix}${factionId}`;
      localStorage.removeItem(key);
    } catch (e) {
      log.error(`Error removing cached status for faction ${factionId}:`, e);
    }
  }

  /**
   * Iterates through localStorage to sweep and delete any expired cached statuses.
   */
  public cleanExpired(): void {
    try {
      const now = Date.now();
      let cleanedCount = 0;

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
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
            // Decrement index since we modified length
            i--;
          }
        } catch {
          localStorage.removeItem(key);
          cleanedCount++;
          i--;
        }
      }

      if (cleanedCount > 0) {
        log.info(`Cleaned ${cleanedCount} expired cached statuses`);
      }
    } catch (e) {
      log.error("Error sweeping expired cached statuses:", e);
    }
  }

  /**
   * Clears all cached statuses from localStorage.
   */
  public clearAll(): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(this.prefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => {
        localStorage.removeItem(key);
      });
      log.info(`Cleared all cached faction statuses`);
    } catch (e) {
      log.error("Error clearing cached statuses:", e);
    }
  }
}

export const factionCache = new FactionCache();
