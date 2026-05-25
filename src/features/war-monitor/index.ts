import { tornApi } from "@utils/api";
import { factionCache } from "@utils/cache";
import { twseconfig } from "@utils/config";
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

const log = logger.child("feature:war-monitor");

async function copyToClipboard(text: string): Promise<boolean> {
  // 1. Try Torn PDA handler if present
  if (
    typeof window !== "undefined" &&
    (window as any).flutter_inappwebview &&
    typeof (window as any).flutter_inappwebview.callHandler === "function"
  ) {
    try {
      await (window as any).flutter_inappwebview.callHandler(
        "copyToClipboard",
        text,
      );
      return true;
    } catch (err) {
      log.error("Failed to copy using Torn PDA callHandler", err);
    }
  }

  // 2. Try Standard navigator.clipboard API
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    log.error("Failed to copy using clipboard API", err);
  }

  // 3. Fallback to execCommand
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  } catch (err) {
    log.error("Failed to copy using fallback", err);
    return false;
  }
}

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
    let everSorted = false;
    let ffscouterSortingDeferred = false;

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

    function injectCopyButton(id: string, li: HTMLLIElement) {
      if (li.querySelector(".twse-copy-btn")) return;

      const atag = li.querySelector<HTMLAnchorElement>(
        "a[href^='/profiles.php']",
      );
      if (!atag) return;

      const parent = li.querySelector<HTMLElement>(".member");
      if (!parent) return;

      const copyBtn = document.createElement("button");
      copyBtn.className = "twse-copy-btn";
      copyBtn.type = "button";
      copyBtn.title = "Copy Name [ID]";
      copyBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="twse-copy-icon"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
      `;

      copyBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const name = atag.textContent?.trim() || "";
        const copyText = `${name} [${id}]`;

        const success = await copyToClipboard(copyText);
        if (success) {
          copyBtn.classList.add("success");
          copyBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="twse-copy-icon-success"><polyline points="20 6 9 17 4 12"></polyline></svg>
          `;
          setTimeout(() => {
            copyBtn.classList.remove("success");
            copyBtn.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="twse-copy-icon"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            `;
          }, 1000);
        }
      });

      parent.appendChild(copyBtn);
    }

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
          injectCopyButton(id, li);
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

    interface SortedColumn {
      column: "member" | "level" | "points" | "status" | null;
      order: "asc" | "desc" | null;
    }

    function getSortedColumn(memberList: Element): SortedColumn {
      const parent = memberList.parentNode as HTMLElement | null;
      if (!parent) return { column: null, order: null };

      const memberDiv = parent.querySelector("div.member div");
      const levelDiv = parent.querySelector("div.level div");
      const pointsDiv = parent.querySelector("div.points div");
      const statusDiv = parent.querySelector("div.status div");

      let column: "member" | "level" | "points" | "status" | null = null;
      let classname = "";

      if (memberDiv?.className.includes("activeIcon__")) {
        column = "member";
        classname = memberDiv.className;
      } else if (levelDiv?.className.includes("activeIcon__")) {
        column = "level";
        classname = levelDiv.className;
      } else if (pointsDiv?.className.includes("activeIcon__")) {
        column = "points";
        classname = pointsDiv.className;
      } else if (statusDiv?.className.includes("activeIcon__")) {
        column = "status";
        classname = statusDiv.className;
      }

      const order = classname.includes("asc__") ? "asc" : "desc";

      if (column && (column !== "points" || order !== "desc")) {
        everSorted = true;
      }

      return { column, order };
    }

    function populateCachedStatus(factionId: string) {
      const cached = factionCache.get(factionId);
      if (!cached) return;

      for (const [id, status] of Object.entries(cached)) {
        memberStatus.set(id, status);
      }
      log.info(
        `Populated war monitor cache with stored statuses for faction: ${factionId}`,
      );
    }

    // Set attributes with deferred writing to prevent layout thrashing
    function queueAttrWrite(
      elem: Element,
      attr: string,
      value: string,
    ): boolean {
      if (elem.getAttribute(attr) !== value) {
        deferredWrites.push([elem, attr, value]);
        return true;
      }
      return false;
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
        log.debug(`Fetching API status update for faction: ${factionId}`);
        const data = await tornApi.fetchFactionData(factionId);
        if (!data) continue;

        if (data.error) {
          if (tornApi.isUnrecoverableError(data.error.code)) {
            log.error(
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

      let dirtySort = false;

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

        if (queueAttrWrite(li, "data-until", String(status.until))) {
          dirtySort = true;
        }
        if (queueAttrWrite(li, "data-since", String(status.since))) {
          dirtySort = true;
        }

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
                if (queueAttrWrite(li, "data-sortA", "0")) {
                  dirtySort = true;
                }
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
              if (queueAttrWrite(li, "data-sortA", "4")) {
                dirtySort = true;
              }
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
              if (queueAttrWrite(li, "data-sortA", "5")) {
                dirtySort = true;
              }
              const dest = route.to;
              dataLocation = `► ${dest}`;
              const remaining = calculateFlightTimeRemaining(li);
              queueStyleWrite(
                statusDiv,
                "--twse-content",
                `"${dataLocation}${remaining}"`,
              );
            } else if (route?.to === "TC") {
              if (queueAttrWrite(li, "data-sortA", "3")) {
                dirtySort = true;
              }
              const dest = route.from;
              dataLocation = `◄ ${dest}`;
              const remaining = calculateFlightTimeRemaining(li);
              queueStyleWrite(
                statusDiv,
                "--twse-content",
                `"${dataLocation}${remaining}"`,
              );
            } else {
              if (queueAttrWrite(li, "data-sortA", "6")) {
                dirtySort = true;
              }
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
                if (queueAttrWrite(li, "data-sortA", "0")) {
                  dirtySort = true;
                }
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
            if (queueAttrWrite(li, "data-sortA", "2")) {
              dirtySort = true;
            }

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
            if (queueAttrWrite(li, "data-sortA", "1")) {
              dirtySort = true;
            }
            queueAttrWrite(statusDiv, TRAVELING, "false");
            queueAttrWrite(statusDiv, HIGHLIGHT, "false");
            queueAttrWrite(statusDiv, STATUS_DIFFERS, "false");
            break;
        }

        if (li.getAttribute("data-location") !== dataLocation) {
          queueAttrWrite(li, "data-location", dataLocation);
          dirtySort = true;
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

      // Handle custom sorting routine
      if (twseconfig.war_sorting && dirtySort) {
        const memberLists = document.querySelectorAll("ul.members-list");
        for (let i = 0; i < memberLists.length; i++) {
          const listElem = memberLists[i];
          let sortedColumn = getSortedColumn(listElem);
          if (!everSorted) {
            sortedColumn = { column: "status", order: "asc" };
          }

          // If FF Scouter is currently sorting this list, defer our sorting:
          if (
            listElem.getAttribute("data-ffscouter-active-filter") === "true"
          ) {
            ffscouterSortingDeferred = true;
            continue;
          }

          if (sortedColumn.column !== "status") {
            continue;
          }

          const lis = Array.from(listElem.childNodes) as HTMLLIElement[];
          // Filter to avoid comment or text nodes if any
          const validLis = lis.filter(
            (node) => node.nodeType === Node.ELEMENT_NODE,
          );
          const sortedLis = validLis.sort((a, b) => {
            let left = a;
            let right = b;
            if (sortedColumn.order === "desc") {
              left = b;
              right = a;
            }

            const sortA_a = parseInt(
              left.getAttribute("data-sortA") || "1",
              10,
            );
            const sortA_b = parseInt(
              right.getAttribute("data-sortA") || "1",
              10,
            );
            const sorta = sortA_a - sortA_b;
            if (sorta !== 0) {
              return sorta;
            }

            const leftLocation = left.getAttribute("data-location") || "";
            const rightLocation = right.getAttribute("data-location") || "";
            if (leftLocation && rightLocation) {
              if (leftLocation < rightLocation) return -1;
              if (leftLocation > rightLocation) return 1;
              return 0;
            }

            // Differs and Okay status sorts since oldest first
            if (sortA_a === 0 || sortA_a === 1) {
              const since_a = parseInt(
                left.getAttribute("data-since") || "0",
                10,
              );
              const since_b = parseInt(
                right.getAttribute("data-since") || "0",
                10,
              );
              return since_b - since_a;
            }

            // Hospital timers sort until soonest first
            const until_a = parseInt(
              left.getAttribute("data-until") || "0",
              10,
            );
            const until_b = parseInt(
              right.getAttribute("data-until") || "0",
              10,
            );
            return until_a - until_b;
          });

          let sorted = true;
          for (let j = 0; j < sortedLis.length; j++) {
            if (listElem.children[j] !== sortedLis[j]) {
              sorted = false;
              break;
            }
          }

          if (!sorted) {
            const fragment = document.createDocumentFragment();
            sortedLis.forEach((li) => {
              fragment.appendChild(li);
            });
            listElem.appendChild(fragment);
          }
        }
      }

      // If FF Scouter sorted our stuff but is no longer actively doing so, we should force a sort in next watch cycle
      if (ffscouterSortingDeferred) {
        const memberLists = document.querySelectorAll("ul.members-list");
        let activeFilterFound = false;
        for (let i = 0; i < memberLists.length; i++) {
          if (
            memberLists[i].getAttribute("data-ffscouter-active-filter") ===
            "true"
          ) {
            activeFilterFound = true;
            break;
          }
        }
        if (!activeFilterFound) {
          ffscouterSortingDeferred = false;
          dirtySort = true;
        }
      }

      // Cleanup disconnected elements to prevent memory leaks
      for (const [id, ref] of memberLis) {
        if (!ref.li.isConnected) {
          memberLis.delete(id);
        }
      }
    }

    const initWarMonitoring = (descriptions: Element) => {
      log.info("Descriptions container detected. Starting observation.");

      let injectedToggle = false;

      const injectSortingToggle = (descEl: Element) => {
        if (injectedToggle) return;
        if (descEl.querySelector("#twse-war-sort-checkbox")) {
          injectedToggle = true;
          return;
        }

        const graphContainer = descEl.querySelector('[class*="graphIcon"]');
        if (!graphContainer || !graphContainer.parentNode) return;

        const parent = graphContainer.parentNode as HTMLElement;
        parent.style.position = "relative";

        const computedStyle = window.getComputedStyle(graphContainer);

        const toggleContainer = document.createElement("div");
        toggleContainer.className = "twse-sort-toggle-container";
        toggleContainer.style.top =
          computedStyle.top && computedStyle.top !== "auto"
            ? computedStyle.top
            : "10px";

        toggleContainer.innerHTML = `
          <label class="twse-sort-toggle-label">
            <input type="checkbox" id="twse-war-sort-checkbox" class="twse-sort-toggle-checkbox" ${
              twseconfig.war_sorting ? "checked" : ""
            } />
            TWSE Sort
          </label>
        `;

        graphContainer.parentNode.insertBefore(toggleContainer, graphContainer);
        log.info(
          "Successfully injected war sorting toggle checkbox before Graph link.",
        );
        injectedToggle = true;

        const checkbox = toggleContainer.querySelector<HTMLInputElement>(
          "#twse-war-sort-checkbox",
        );
        if (checkbox) {
          checkbox.addEventListener("change", (e) => {
            const isChecked = (e.target as HTMLInputElement).checked;
            log.info(`War sorting configuration changed: ${isChecked}`);
            twseconfig.war_sorting = isChecked;
          });
        }
      };

      injectSortingToggle(descriptions);
      observeElement(descriptions, () => {
        if (!injectedToggle) {
          injectSortingToggle(descriptions);
        }
        if (!foundWar && descriptions.querySelector(".faction-war")) {
          foundWar = true;
          extractAllMemberLis();
          const ids = getFactionIds();
          ids.forEach(populateCachedStatus);
          updateStatuses();
        }
      });

      if (descriptions.querySelector(".faction-war")) {
        foundWar = true;
        extractAllMemberLis();
        const ids = getFactionIds();
        ids.forEach(populateCachedStatus);
        updateStatuses();
      }
    };

    // Find and watch the active war DOM node
    const factWarList = await waitForElement("#faction_war_list_id");
    if (factWarList) {
      const descriptionsObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (
              node instanceof HTMLElement &&
              node.classList.contains("descriptions")
            ) {
              log.info("Observed descriptions container added to DOM");
              initWarMonitoring(node);
            }
          }
        }
      });
      descriptionsObserver.observe(factWarList, { childList: true });

      const existingDescriptions = factWarList.querySelector(".descriptions");
      if (existingDescriptions) {
        log.info("Found existing descriptions container");
        initWarMonitoring(existingDescriptions);
      }
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
