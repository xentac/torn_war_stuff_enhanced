import logger from "./logger";
import type { CachedFactionMembers, FactionId, FactionMember } from "./types";

const log = logger.child("cache");

// Bump whenever the shape of CachedFactionMembers changes, so stale
// localStorage entries from a previous version are discarded rather than
// misread. The 10s TTL below would also catch this eventually, but only
// after a deploy-time window where old-shaped data could otherwise be read.
const CACHE_VERSION = 1;

export class FactionCache {
  private prefix = "xentac-torn_war_stuff_enhanced-status-";
  private ttlMs = 10_000; // 10 seconds TTL

  /**
   * Retrieves the cached members for a faction.
   */
  public get(factionId: FactionId): Record<string, FactionMember> | null {
    try {
      const key = `${this.prefix}${factionId}`;
      const cacheStr = localStorage.getItem(key);
      if (!cacheStr) {
        return null;
      }

      const parsed = JSON.parse(cacheStr) as Partial<CachedFactionMembers>;
      if (
        !parsed ||
        typeof parsed.timestamp !== "number" ||
        !parsed.members ||
        parsed.version !== CACHE_VERSION
      ) {
        this.remove(factionId);
        return null;
      }

      const now = Date.now();
      if (now - parsed.timestamp > this.ttlMs) {
        this.remove(factionId);
        return null;
      }

      return parsed.members;
    } catch (e) {
      log.error(`Error reading cached members for faction ${factionId}:`, e);
      this.remove(factionId);
      return null;
    }
  }

  /**
   * Caches the members for a faction.
   */
  public set(
    factionId: FactionId,
    members: Record<string, FactionMember>,
  ): void {
    try {
      const key = `${this.prefix}${factionId}`;
      const cacheItem: CachedFactionMembers = {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        members,
      };
      localStorage.setItem(key, JSON.stringify(cacheItem));
    } catch (e) {
      log.error(`Error caching members for faction ${factionId}:`, e);
    }
  }

  /**
   * Removes cached status for a faction.
   */
  public remove(factionId: FactionId): void {
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
