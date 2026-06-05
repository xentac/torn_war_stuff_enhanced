import { tornApi } from "@utils/api";
import { factionCache } from "@utils/cache";
import { twseconfig } from "@utils/config";
import { observeElement, on_navigation, waitForElement } from "@utils/dom";
import logger from "@utils/logger";
import {
  calc_delta,
  formatChainCooldown,
  formatChainTimeout,
  getCurrentTimeSec,
} from "@utils/time";
import {
  extract_destinations_from_description,
  shorten_destination,
} from "@utils/travel";
import type { FactionMemberStatus } from "@utils/types";
import "@ui/styles.css";
import { type Feature, StartTime } from "../feature";

const log = logger.child("feature:war-monitor");

interface MemberLiRef {
  li: HTMLLIElement;
  statusDiv: HTMLDivElement | null;
}

interface ActiveChainState {
  current: number;
  max: number;
  timeout: number;
  modifier: number;
  tag: string;
  apiReceivedAt: number;
  cooldown: number;
  end?: number;
}

const TRAVELING = "data-twse-traveling";
const HIGHLIGHT = "data-twse-highlight";
const STATUS_DIFFERS = "data-twse-status-differs";

function shouldRunMonitor(): boolean {
  if (!window.location.href.includes("factions.php")) {
    return false;
  }
  const hash = window.location.hash || "";

  // Exclude tab pages where the active war list is not displayed (e.g. territory, info, rank, controls, etc.)
  if (!hash.startsWith("#/war/")) {
    return false;
  }

  return true;
}

const WarMonitorFeature: Feature = {
  name: "War Monitor",
  description:
    "Monitors active Faction wars, retrieves real-time member statuses, and decorates rows",
  executionTime: StartTime.DocumentEnd,

  shouldRun(): boolean {
    return window.location.href.includes("factions.php");
  },

  async run(): Promise<void> {
    let active = false;
    let stopMonitor: (() => void) | null = null;

    const startMonitor = async () => {
      if (active) return;
      active = true;

      // 1. Clean expired cache records on start
      factionCache.cleanExpired();

      const syncBodyClasses = () => {
        document.body.classList.toggle(
          "twse-copy-disabled",
          !twseconfig.copy_button_enabled,
        );
        document.body.classList.toggle(
          "twse-bubble-disabled",
          !twseconfig.bubble_enabled,
        );
      };

      // Synchronize initial configuration classes
      syncBodyClasses();

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

      const activeChains = new Map<string, ActiveChainState>();
      let lastChainHtml = "";
      let isDragging = false;

      // Wire global event listeners for instant UI state synchronization
      const onConfigUpdated = () => {
        syncBodyClasses();
        const checkbox = document.querySelector<HTMLInputElement>(
          "#twse-war-sort-checkbox",
        );
        if (checkbox) {
          checkbox.checked = twseconfig.war_sorting;
        }
      };
      window.addEventListener("twse-config-updated", onConfigUpdated);

      const onClearCache = () => {
        log.info("Received twse-clear-cache event. Purging all caches.");
        memberStatus.clear();
        factionCache.clearAll();
        activeChains.clear();
        updateStatuses();
      };
      window.addEventListener("twse-clear-cache", onClearCache);

      let bubbleContainer = document.getElementById(
        "twse-chain-bubble",
      ) as HTMLDivElement | null;
      if (!bubbleContainer) {
        bubbleContainer = document.createElement("div");
        bubbleContainer.id = "twse-chain-bubble";
        bubbleContainer.className = "twse-chain-bubble hidden";
        document.body.appendChild(bubbleContainer);
      }

      if (
        bubbleContainer &&
        !bubbleContainer.querySelector(".twse-chain-body")
      ) {
        bubbleContainer.innerHTML = `<div class="twse-chain-body"></div>`;
      }

      const getBubbleRect = (): {
        left: number;
        top: number;
        width: number;
        height: number;
      } => {
        if (
          bubbleContainer &&
          typeof bubbleContainer.getBoundingClientRect === "function"
        ) {
          const r = bubbleContainer.getBoundingClientRect();
          return {
            left: r.left ?? 0,
            top: r.top ?? 0,
            width: r.width || 170,
            height: r.height || 60,
          };
        }
        return { left: 0, top: 0, width: 170, height: 60 };
      };

      const clampToScreen = () => {
        if (!bubbleContainer) return;
        const rect = getBubbleRect();
        const w = rect.width;
        const h = rect.height;

        const currentLeft = parseFloat(bubbleContainer.style.left);
        const currentTop = parseFloat(bubbleContainer.style.top);

        if (!Number.isNaN(currentLeft) && !Number.isNaN(currentTop)) {
          const maxLeft = window.innerWidth - w;
          const maxTop = window.innerHeight - h;
          bubbleContainer.style.left = `${Math.max(0, Math.min(currentLeft, maxLeft))}px`;
          bubbleContainer.style.top = `${Math.max(0, Math.min(currentTop, maxTop))}px`;
        }
      };

      window.addEventListener("resize", clampToScreen, { passive: true });

      // Draggable floating bubble implementation (Mouse & Touch compatible)
      if (bubbleContainer) {
        // 1. Recover saved position if exists
        const savedPos = twseconfig.bubble_position;
        if (savedPos) {
          bubbleContainer.style.bottom = "auto";
          bubbleContainer.style.right = "auto";
          bubbleContainer.style.left = `${savedPos.left}px`;
          bubbleContainer.style.top = `${savedPos.top}px`;
          setTimeout(clampToScreen, 0);
        }

        let startX = 0;
        let startY = 0;
        let initialX = 0;
        let initialY = 0;

        const dragStart = (e: MouseEvent | TouchEvent) => {
          isDragging = true;

          const isTouch = e.type === "touchstart";
          const touchEvent = e as TouchEvent;
          const mouseEvent = e as MouseEvent;
          const clientX =
            isTouch && touchEvent.touches && touchEvent.touches.length > 0
              ? touchEvent.touches[0].clientX
              : mouseEvent.clientX;
          const clientY =
            isTouch && touchEvent.touches && touchEvent.touches.length > 0
              ? touchEvent.touches[0].clientY
              : mouseEvent.clientY;

          startX = clientX;
          startY = clientY;

          if (bubbleContainer) {
            const rect = getBubbleRect();
            initialX = rect.left;
            initialY = rect.top;

            bubbleContainer.style.transition = "none";
            bubbleContainer.style.cursor = "grabbing";
          }

          if (isTouch) {
            e.stopPropagation();
          }

          // Prevent surrounding text selection and default scroll behaviors
          if (e.cancelable) {
            e.preventDefault();
          }
          window.getSelection()?.removeAllRanges();

          if (isTouch) {
            if (bubbleContainer) {
              bubbleContainer.addEventListener("touchmove", dragMove, {
                passive: false,
              });
              bubbleContainer.addEventListener("touchend", dragEnd);
              bubbleContainer.addEventListener("touchcancel", dragEnd);
            }
          } else {
            document.addEventListener("mousemove", dragMove);
            document.addEventListener("mouseup", dragEnd);
          }
        };

        const dragMove = (e: MouseEvent | TouchEvent) => {
          if (!isDragging || !bubbleContainer) return;

          const isTouch = e.type === "touchmove";
          if (isTouch) {
            e.stopPropagation();
          }

          if (e.cancelable) {
            e.preventDefault();
          }

          const touchEvent = e as TouchEvent;
          const mouseEvent = e as MouseEvent;
          const clientX =
            isTouch && touchEvent.touches && touchEvent.touches.length > 0
              ? touchEvent.touches[0].clientX
              : mouseEvent.clientX;
          const clientY =
            isTouch && touchEvent.touches && touchEvent.touches.length > 0
              ? touchEvent.touches[0].clientY
              : mouseEvent.clientY;

          const dx = clientX - startX;
          const dy = clientY - startY;

          const rect = getBubbleRect();
          const w = rect.width;
          const h = rect.height;

          let newLeft = initialX + dx;
          let newTop = initialY + dy;

          const maxLeft = window.innerWidth - w;
          const maxTop = window.innerHeight - h;

          newLeft = Math.max(0, Math.min(newLeft, maxLeft));
          newTop = Math.max(0, Math.min(newTop, maxTop));

          bubbleContainer.style.bottom = "auto";
          bubbleContainer.style.right = "auto";
          bubbleContainer.style.left = `${newLeft}px`;
          bubbleContainer.style.top = `${newTop}px`;
        };

        const dragEnd = (e?: MouseEvent | TouchEvent) => {
          isDragging = false;
          if (e && (e.type === "touchend" || e.type === "touchcancel")) {
            e.stopPropagation();
          }

          if (bubbleContainer) {
            bubbleContainer.style.cursor = "grab";

            const left = parseFloat(bubbleContainer.style.left) || 0;
            const top = parseFloat(bubbleContainer.style.top) || 0;
            twseconfig.bubble_position = { left, top };

            bubbleContainer.removeEventListener("touchmove", dragMove);
            bubbleContainer.removeEventListener("touchend", dragEnd);
            bubbleContainer.removeEventListener("touchcancel", dragEnd);
          }

          document.removeEventListener("mousemove", dragMove);
          document.removeEventListener("mouseup", dragEnd);

          // Force a draw update immediately after dragging ends
          updateChainBubble();
        };

        bubbleContainer.addEventListener("mousedown", dragStart);
        bubbleContainer.addEventListener("touchstart", dragStart, {
          passive: false,
        });
      }

      // Listen for visibility updates
      const onVisibilityChange = () => {
        pageVisible = !document.hidden;
      };
      document.addEventListener("visibilitychange", onVisibilityChange);

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

      const attrCache = new WeakMap<Element, Record<string, string>>();
      const styleCache = new WeakMap<HTMLElement, Record<string, string>>();
      const cacheableAttrs = new Set([
        "data-until",
        "data-since",
        "data-sortA",
        "data-location",
        "data-twse-traveling",
        "data-twse-highlight",
        "data-twse-status-differs",
        "data-twse-overridden",
      ]);

      // Set attributes with deferred writing to prevent layout thrashing
      function queueAttrWrite(
        elem: Element,
        attr: string,
        value: string,
      ): boolean {
        if (cacheableAttrs.has(attr)) {
          let cache = attrCache.get(elem);
          if (!cache) {
            cache = {};
            attrCache.set(elem, cache);
          }
          if (cache[attr] === undefined) {
            cache[attr] = elem.getAttribute(attr) || "";
          }
          if (cache[attr] !== value) {
            cache[attr] = value;
            deferredWrites.push([elem, attr, value]);
            return true;
          }
          return false;
        }

        if (elem.getAttribute(attr) !== value) {
          deferredWrites.push([elem, attr, value]);
          return true;
        }
        return false;
      }

      function queueStyleWrite(elem: HTMLElement, prop: string, value: string) {
        if (prop === "--twse-content") {
          let cache = styleCache.get(elem);
          if (!cache) {
            cache = {};
            styleCache.set(elem, cache);
          }
          if (cache[prop] === undefined) {
            cache[prop] = elem.style.getPropertyValue(prop);
          }
          if (cache[prop] !== value) {
            cache[prop] = value;
            deferredStyles.push([elem, prop, value]);
          }
          return;
        }

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

          if (data.chain) {
            activeChains.set(factionId, {
              current: data.chain.current,
              max: data.chain.max,
              timeout: data.chain.timeout,
              modifier: data.chain.modifier,
              tag: data.tag || "",
              apiReceivedAt: getCurrentTimeSec(),
              cooldown: data.chain.cooldown || 0,
              end: data.chain.end,
            });
          }
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
            queueAttrWrite(statusDiv, "data-twse-overridden", "false");
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
                queueAttrWrite(statusDiv, "data-twse-overridden", "false");
                break;
              }

              queueAttrWrite(statusDiv, STATUS_DIFFERS, "false");
              queueAttrWrite(statusDiv, "data-twse-overridden", "true");

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
                queueStyleWrite(
                  statusDiv,
                  "--twse-content",
                  `"${dataLocation}"`,
                );
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
                queueAttrWrite(statusDiv, TRAVELING, "false");
                queueAttrWrite(statusDiv, HIGHLIGHT, "false");
                queueAttrWrite(statusDiv, "data-twse-overridden", "false");
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
                queueAttrWrite(statusDiv, "data-twse-overridden", "false");
                break;
              }

              queueAttrWrite(statusDiv, "data-twse-overridden", "true");
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
              if (queueAttrWrite(li, "data-sortA", "1")) {
                dirtySort = true;
              }
              queueAttrWrite(statusDiv, TRAVELING, "false");
              queueAttrWrite(statusDiv, HIGHLIGHT, "false");
              queueAttrWrite(statusDiv, STATUS_DIFFERS, "false");
              queueAttrWrite(statusDiv, "data-twse-overridden", "false");
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

        updateChainBubble();
      }

      function updateChainBubble() {
        if (!bubbleContainer || isDragging) return;

        if (!foundWar || activeChains.size === 0) {
          bubbleContainer.classList.add("hidden");
          lastChainHtml = "";
          return;
        }

        const bodyContainer = bubbleContainer.querySelector(".twse-chain-body");
        if (!bodyContainer) return;

        let html = "";
        const now = getCurrentTimeSec();

        activeChains.forEach((chain) => {
          let formattedTime = "";
          let timerClass = "okay";
          let countClass = "";

          if (chain.cooldown > 0) {
            // 1. Cooldown state (Broken chain)
            const elapsed = now - chain.apiReceivedAt;
            const remainingCooldown = Math.max(0, chain.cooldown - elapsed);
            formattedTime = formatChainCooldown(remainingCooldown);
            timerClass = "cooldown";
            countClass = "cooldown";
          } else if (chain.timeout === 0) {
            // 2. Non-existent/not running chain state
            formattedTime = "-:--";
            timerClass = "okay"; // Default standard okay color
          } else {
            // 3. Active running chain countdown
            const elapsed = now - chain.apiReceivedAt;
            const remaining =
              chain.end && chain.end > 0
                ? chain.end - now
                : chain.timeout - elapsed;
            formattedTime = formatChainTimeout(remaining);

            if (remaining < 0) {
              timerClass = "negative";
            } else if (remaining < 60) {
              timerClass = "urgent";
            }
          }

          html += `
            <div class="twse-chain-row">
              <span class="twse-chain-tag">[${chain.tag || "Faction"}]</span>
              <div class="twse-chain-stats">
                <span class="twse-chain-count ${countClass}">${chain.current}/${chain.max}</span>
                <span class="twse-chain-mult">${chain.modifier.toFixed(2)}x</span>
                <span class="twse-chain-timer ${timerClass}">${formattedTime}</span>
              </div>
            </div>
          `;
        });

        if (lastChainHtml !== html) {
          bodyContainer.innerHTML = html;
          lastChainHtml = html;
        }
        bubbleContainer.classList.remove("hidden");
      }

      let descriptionsObserver: MutationObserver | null = null;
      let innerDescriptionsObserver: MutationObserver | null = null;

      const initWarMonitoring = (descriptions: Element) => {
        foundWar = false;
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

          graphContainer.parentNode.insertBefore(
            toggleContainer,
            graphContainer,
          );
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
        innerDescriptionsObserver = observeElement(descriptions, () => {
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
          if (foundWar && injectedToggle) {
            log.info(
              "Active war detected and toggle injected. Disconnecting innerDescriptionsObserver.",
            );
            innerDescriptionsObserver?.disconnect();
            innerDescriptionsObserver = null;
          }
        });

        if (descriptions.querySelector(".faction-war")) {
          foundWar = true;
          extractAllMemberLis();
          const ids = getFactionIds();
          ids.forEach(populateCachedStatus);
          updateStatuses();

          if (injectedToggle) {
            log.info(
              "Active war detected at start and toggle injected. Disconnecting innerDescriptionsObserver.",
            );
            innerDescriptionsObserver?.disconnect();
            innerDescriptionsObserver = null;
          }
        }
      };

      // Find and watch the active war DOM node
      const factWarList = await waitForElement("#faction_war_list_id");
      if (!active) return; // Guard against race conditions if stopped while waiting

      if (factWarList) {
        descriptionsObserver = new MutationObserver((mutations) => {
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
      const pollingInterval = setInterval(() => {
        if (running && foundWar) {
          updateStatuses();
        }
      }, 10_000);

      // Set countdown draw timers (updates clock draw variables every 500ms)
      const watchInterval = setInterval(() => {
        if (foundWar && running && pageVisible) {
          watch();
        }
      }, 500);

      stopMonitor = () => {
        active = false;
        running = false;

        // 1. Clear intervals
        clearInterval(pollingInterval);
        clearInterval(watchInterval);

        // 2. Disconnect observers
        if (descriptionsObserver) {
          descriptionsObserver.disconnect();
        }
        if (innerDescriptionsObserver) {
          innerDescriptionsObserver.disconnect();
        }

        // 3. Remove event listeners
        window.removeEventListener("twse-config-updated", onConfigUpdated);
        window.removeEventListener("twse-clear-cache", onClearCache);
        window.removeEventListener("resize", clampToScreen);
        document.removeEventListener("visibilitychange", onVisibilityChange);

        // 4. Remove UI/DOM elements
        if (bubbleContainer) {
          bubbleContainer.remove();
          bubbleContainer = null;
        }
        document.querySelector(".twse-sort-toggle-container")?.remove();
      };
    };

    const handleNavigation = () => {
      const shouldRun = shouldRunMonitor();
      if (shouldRun) {
        if (stopMonitor) {
          stopMonitor();
          stopMonitor = null;
        }
        startMonitor();
      } else if (!shouldRun && active) {
        if (stopMonitor) {
          stopMonitor();
          stopMonitor = null;
        }
      }
    };

    on_navigation(handleNavigation);

    if (shouldRunMonitor()) {
      startMonitor();
    }

    // Register PDA / global script prevention event
    window.dispatchEvent(new Event("FFScouterV2DisableWarMonitor"));
  },
};

export default WarMonitorFeature;
