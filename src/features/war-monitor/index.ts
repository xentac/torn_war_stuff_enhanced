import { tornApi } from "@utils/api";
import { factionCache } from "@utils/cache";
import { observeElement, waitForElement } from "@utils/dom";
import logger from "@utils/logger";
import { calc_delta, getCurrentTimeSec } from "@utils/time";
import {
  extract_destinations_from_description,
  shorten_destination,
} from "@utils/travel";
import type { FactionMemberStatus } from "@utils/types";
import "@ui/styles.css";
import { type Feature, StartTime } from "../feature";

interface MemberLiRef {
  li: HTMLLIElement;
  statusDiv: HTMLDivElement | null;
}

const TRAVELING = "data-twse-traveling";
const HIGHLIGHT = "data-twse-highlight";
const STATUS_DIFFERS = "data-twse-status-differs";

const WarMonitorFeature: Feature = {
  name: "War Monitor",
  description:
    "Monitors active Faction wars, retrieves real-time member statuses, and decorates rows",
  executionTime: StartTime.DocumentEnd,

  shouldRun(): boolean {
    return window.location.href.includes("factions.php");
  },

  async run(): Promise<void> {
    // 1. Clean expired cache records on start
    factionCache.cleanExpired();

    let running = true;
    let foundWar = false;
    let pageVisible = !document.hidden;

    const memberStatus = new Map<string, FactionMemberStatus>();
    const memberLis = new Map<string, MemberLiRef>();
    const deferredWrites: [Element, string, string][] = [];
    const deferredStyles: [HTMLElement, string, string][] = [];

    let lastRequestTime = 0;
    const minTimeBetweenRequestsMs = 10_000;

    // Listen for visibility updates
    document.addEventListener("visibilitychange", () => {
      pageVisible = !document.hidden;
    });

    // Extract faction member list details
    function extractAllMemberLis() {
      memberLis.clear();
      const memberLists = document.querySelectorAll("ul.members-list");
      memberLists.forEach((ul) => {
        const lis = ul.querySelectorAll<HTMLLIElement>("li.enemy, li.your");
        lis.forEach((li) => {
          const atag = li.querySelector<HTMLAnchorElement>(
            "a[href^='/profiles.php']",
          );
          if (!atag) return;
          const parts = atag.href.split("ID=");
          if (parts.length <= 1) return;
          const id = parts[1];
          memberLis.set(id, {
            li,
            statusDiv: li.querySelector<HTMLDivElement>("div.status"),
          });
        });
      });
    }

    function getFactionIds(): string[] {
      const memberLists = document.querySelectorAll("ul.members-list");
      const ids: string[] = [];
      memberLists.forEach((elem) => {
        const q = elem.querySelector<HTMLAnchorElement>(
          "a[href^='/factions.php']",
        );
        if (!q) return;
        const s = q.href.split("ID=");
        if (s.length <= 1) return;
        const id = s[1];
        if (id) {
          ids.push(id);
        }
      });
      return ids;
    }

    function populateCachedStatus(factionId: string) {
      const cached = factionCache.get(factionId);
      if (!cached) return;

      for (const [id, status] of Object.entries(cached)) {
        memberStatus.set(id, status);
      }
      logger.info(
        `Populated war monitor cache with stored statuses for faction: ${factionId}`,
      );
    }

    // Set attributes with deferred writing to prevent layout thrashing
    function queueAttrWrite(elem: Element, attr: string, value: string) {
      if (elem.getAttribute(attr) !== value) {
        deferredWrites.push([elem, attr, value]);
      }
    }

    function queueStyleWrite(elem: HTMLElement, prop: string, value: string) {
      if (elem.style.getPropertyValue(prop) !== value) {
        deferredStyles.push([elem, prop, value]);
      }
    }

    function calculateFlightTimeRemaining(li: HTMLLIElement): string {
      const earliestArrivalAttr = li.getAttribute("data-earliest-arrival");
      const latestArrivalAttr = li.getAttribute("data-latest-arrival");
      if (!earliestArrivalAttr && !latestArrivalAttr) return "";

      const earliestArrival = parseInt(earliestArrivalAttr || "", 10);
      const latestArrival = parseInt(latestArrivalAttr || "", 10);
      if (Number.isNaN(earliestArrival) && Number.isNaN(latestArrival))
        return "";

      const now = getCurrentTimeSec();
      if (!Number.isNaN(earliestArrival) && earliestArrival > now) {
        const remaining = Math.round(earliestArrival - now);
        return ` ${calc_delta(remaining, false, false)}`;
      }
      if (!Number.isNaN(latestArrival) && latestArrival > now) {
        const remaining = Math.round(latestArrival - now);
        return ` <${calc_delta(remaining, false, false)}`;
      }

      return " LATE";
    }

    // Primary update polling executor
    async function updateStatuses() {
      if (!running) return;

      const factionIds = getFactionIds();
      if (factionIds.length === 0) return;

      const now = Date.now();
      if (now - lastRequestTime < minTimeBetweenRequestsMs) return;
      lastRequestTime = now;

      for (const factionId of factionIds) {
        logger.debug(`Fetching API status update for faction: ${factionId}`);
        const data = await tornApi.fetchFactionData(factionId);
        if (!data) continue;

        if (data.error) {
          if (tornApi.isUnrecoverableError(data.error.code)) {
            logger.error(
              "Torn API returned unrecoverable error. Halting war monitor polling.",
            );
            running = false;
            break;
          }
          continue;
        }

        if (!data.members) continue;

        const reqTime = Date.now();
        const factionStatus: Record<string, FactionMemberStatus> = {};

        for (const [id, memberData] of Object.entries(data.members)) {
          const status = memberData.status;
          status.last_req_time = reqTime;

          const prev = memberStatus.get(id);
          const prev_state = prev?.state ?? "Unknown";
          const prev_since = prev?.since ?? reqTime;

          if (prev_state === status.state) {
            status.since = prev_since;
          } else {
            status.since = reqTime;
          }

          memberStatus.set(id, status);
          factionStatus[id] = status;
        }

        factionCache.set(factionId, factionStatus);
      }
    }

    // Periodic UI updates (attributes & layout settings)
    function watch() {
      deferredWrites.length = 0;
      deferredStyles.length = 0;

      memberLis.forEach((elem, id) => {
        const li = elem.li;
        const statusDiv = elem.statusDiv;
        if (!li || !statusDiv) return;

        const status = memberStatus.get(id);
        if (!status || !running) {
          queueStyleWrite(
            statusDiv,
            "--twse-content",
            `"${statusDiv.textContent || ""}"`,
          );
          return;
        }

        queueAttrWrite(li, "data-until", String(status.until));
        queueAttrWrite(li, "data-since", String(status.since));

        let dataLocation = "";

        switch (status.state) {
          case "Abroad":
          case "Traveling": {
            const hasTravelingClass =
              statusDiv.classList.contains("traveling") ||
              statusDiv.classList.contains("abroad");
            if (!hasTravelingClass) {
              if (statusDiv.textContent === "Okay") {
                queueAttrWrite(statusDiv, STATUS_DIFFERS, "true");
                queueAttrWrite(li, "data-sortA", "0");
              }
              queueStyleWrite(
                statusDiv,
                "--twse-content",
                `"${statusDiv.textContent || ""}"`,
              );
              break;
            }

            queueAttrWrite(statusDiv, STATUS_DIFFERS, "false");

            if (status.description.includes("In ")) {
              queueAttrWrite(li, "data-sortA", "4");
              const content = shorten_destination(
                status.description.split("In ")[1],
              );
              dataLocation = content;
              queueStyleWrite(statusDiv, "--twse-content", `"${content}"`);
              break;
            }

            const route = extract_destinations_from_description(
              status.description,
            );
            if (route?.from === "TC") {
              queueAttrWrite(li, "data-sortA", "5");
              const dest = route.to;
              dataLocation = `► ${dest}`;
              const remaining = calculateFlightTimeRemaining(li);
              queueStyleWrite(
                statusDiv,
                "--twse-content",
                `"${dataLocation}${remaining}"`,
              );
            } else if (route?.to === "TC") {
              queueAttrWrite(li, "data-sortA", "3");
              const dest = route.from;
              dataLocation = `◄ ${dest}`;
              const remaining = calculateFlightTimeRemaining(li);
              queueStyleWrite(
                statusDiv,
                "--twse-content",
                `"${dataLocation}${remaining}"`,
              );
            } else {
              queueAttrWrite(li, "data-sortA", "6");
              dataLocation = "Traveling";
              queueStyleWrite(statusDiv, "--twse-content", `"${dataLocation}"`);
            }
            break;
          }

          case "Hospital":
          case "Jail": {
            const now = getCurrentTimeSec();
            const timeRemaining = Math.round(status.until - now);

            const hasHospitalClass =
              statusDiv.classList.contains("hospital") ||
              statusDiv.classList.contains("jail");
            if (!hasHospitalClass) {
              if (timeRemaining >= 0) {
                queueAttrWrite(li, "data-sortA", "0");
                queueAttrWrite(statusDiv, STATUS_DIFFERS, "true");
              }
              queueStyleWrite(
                statusDiv,
                "--twse-content",
                `"${statusDiv.textContent || ""}"`,
              );
              queueAttrWrite(statusDiv, TRAVELING, "false");
              queueAttrWrite(statusDiv, HIGHLIGHT, "false");
              break;
            }

            queueAttrWrite(statusDiv, STATUS_DIFFERS, "false");
            queueAttrWrite(li, "data-sortA", "2");

            if (status.description.includes("In a")) {
              queueAttrWrite(statusDiv, TRAVELING, "true");
            } else {
              queueAttrWrite(statusDiv, TRAVELING, "false");
            }

            if (timeRemaining <= 0) {
              queueAttrWrite(statusDiv, HIGHLIGHT, "false");
              break;
            }

            const timeStr = calc_delta(timeRemaining);
            queueStyleWrite(statusDiv, "--twse-content", `"${timeStr}"`);

            if (timeRemaining < 300) {
              queueAttrWrite(statusDiv, HIGHLIGHT, "true");
            } else {
              queueAttrWrite(statusDiv, HIGHLIGHT, "false");
            }
            break;
          }

          default:
            queueStyleWrite(
              statusDiv,
              "--twse-content",
              `"${statusDiv.textContent || ""}"`,
            );
            queueAttrWrite(li, "data-sortA", "1");
            queueAttrWrite(statusDiv, TRAVELING, "false");
            queueAttrWrite(statusDiv, HIGHLIGHT, "false");
            queueAttrWrite(statusDiv, STATUS_DIFFERS, "false");
            break;
        }

        if (li.getAttribute("data-location") !== dataLocation) {
          queueAttrWrite(li, "data-location", dataLocation);
        }
      });

      // Commit all writes at once
      if (deferredWrites.length > 0) {
        for (const [elem, attr, val] of deferredWrites) {
          elem.setAttribute(attr, val);
        }
        deferredWrites.length = 0;
      }

      if (deferredStyles.length > 0) {
        for (const [elem, prop, val] of deferredStyles) {
          elem.style.setProperty(prop, val);
        }
        deferredStyles.length = 0;
      }

      // Cleanup disconnected elements to prevent memory leaks
      for (const [id, ref] of memberLis) {
        if (!ref.li.isConnected) {
          memberLis.delete(id);
        }
      }
    }

    const initWarMonitoring = (factionWarList: Element) => {
      logger.info("Faction war list detected. Starting observation.");
      if (factionWarList.querySelector(".faction-war")) {
        foundWar = true;
        extractAllMemberLis();
        const ids = getFactionIds();
        ids.forEach(populateCachedStatus);
        updateStatuses();
        return;
      }

      if (foundWar) return;

      const descriptions = factionWarList.querySelector(".descriptions");
      if (descriptions) {
        observeElement(descriptions, () => {
          if (!foundWar && factionWarList.querySelector(".faction-war")) {
            foundWar = true;
            extractAllMemberLis();
            const ids = getFactionIds();
            ids.forEach(populateCachedStatus);
            updateStatuses();
          }
        });
      }
    };

    // Find and watch the active war DOM node
    const factWarList = await waitForElement("#faction_war_list_id");
    if (factWarList) {
      initWarMonitoring(factWarList);
    }

    // Set polling timers (updates statuses from API every 10 seconds)
    setInterval(() => {
      if (running && foundWar) {
        updateStatuses();
      }
    }, 10_000);

    // Set countdown draw timers (updates clock draw variables every 500ms)
    setInterval(() => {
      if (foundWar && running && pageVisible) {
        watch();
      }
    }, 500);

    // Register PDA / global script prevention event
    window.dispatchEvent(new Event("FFScouterV2DisableWarMonitor"));
  },
};

export default WarMonitorFeature;
