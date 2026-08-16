import { tornApi } from "@utils/api";
import { BatchedDomWriter } from "@utils/batched-dom-writer";
import { factionCache } from "@utils/cache";
import { twseconfig } from "@utils/config";
import {
  observeElement,
  on_navigation,
  sort_by_attribute,
  waitForElement,
} from "@utils/dom";
import { formatStatEstimate } from "@utils/format";
import logger from "@utils/logger";
import {
  calc_delta,
  formatChainCooldown,
  formatChainTimeout,
  getCurrentTime,
} from "@utils/time";
import { shorten_destination } from "@utils/travel";
import { twseClient } from "@utils/twse-server";
import type {
  DurationMs,
  DurationSec,
  FactionId,
  FactionMember,
  FactionMemberStatus,
  FactionResponse,
  TimestampMs,
  TornTimestampMs,
  TornTimestampSec,
} from "@utils/types";
import "@ui/styles.css";
import { type Feature, StartTime } from "../feature";
import type { MemberClassification, TransitionState } from "./classify-member";
import {
  classifyMember,
  parseCanonicalStatus,
  SortGroup,
} from "./classify-member";
import {
  getFactionIds,
  getMemberLists,
  getMemberRows,
  getSortedColumn,
} from "./torn-war-page";

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
  apiReceivedAt: TimestampMs;
  cooldown: TornTimestampSec;
  end?: TornTimestampSec;
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

interface WarMonitorFeatureType extends Feature {
  intervals: {
    poll: DurationMs;
    watch: DurationMs;
    minTimeBetweenRequests: DurationMs;
    unexpectedHighlight: DurationMs;
    nearExpiryThresholdSec: DurationSec;
    expectedExpiryToleranceSec: DurationSec;
  };
}

const WarMonitorFeature: WarMonitorFeatureType = {
  name: "War Monitor",
  description:
    "Monitors active Faction wars, retrieves real-time member statuses, and decorates rows",
  executionTime: StartTime.DocumentEnd,

  intervals: {
    poll: 10_000,
    watch: 500,
    minTimeBetweenRequests: 10_000,
    unexpectedHighlight: 10_000,
    nearExpiryThresholdSec: 300,
    expectedExpiryToleranceSec: 2,
  },

  shouldRun(): boolean {
    return window.location.href.includes("factions.php");
  },

  async run(): Promise<void> {
    let active = false;
    let stopMonitor: (() => void) | null = null;

    const isVisible = () => {
      return !document.hidden;
    };

    // Torn PDA's focus/blur events don't update until the user taps the
    // screen (the same defect as the hasFocus() check removed in 0bd5286).
    // Fixed in Torn PDA's dev branch but not yet shipped to stable — remove
    // this check (and its uses below) once that fix reaches stable.
    const isTornPda = () =>
      typeof window !== "undefined" &&
      !!(window as any).flutter_inappwebview &&
      typeof (window as any).flutter_inappwebview.callHandler === "function";

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
      let pageVisible = isVisible();
      const onTornPda = isTornPda();
      // The unexpected-transition highlight is gated on window focus, not
      // just tab visibility (ADR-0007) — Torn's scripting rules forbid using
      // data extracted from an unfocused window to draw attention to itself.
      // On Torn PDA, tab visibility substitutes for focus (see isTornPda).
      let windowFocused = onTornPda ? !document.hidden : document.hasFocus();
      const updateWindowFocusClass = () => {
        document.documentElement.classList.toggle(
          "twse-window-focused",
          windowFocused,
        );
      };
      updateWindowFocusClass();
      let everSorted = false;
      let ffscouterSortingDeferred = false;
      // Set when FF Scouter's filter clears, so the NEXT watch() tick forces a
      // sort even if nothing else changed — we skipped sorting entirely while
      // the filter was active, so our own sort order may now be stale.
      let forceSortNextTick = false;

      const members = new Map<string, FactionMember>();
      const memberLis = new Map<string, MemberLiRef>();
      const unexpectedTransitions = new Map<string, TimestampMs>();
      const okaySinceTimestamps = new Map<string, TornTimestampMs>();
      const domWriter = new BatchedDomWriter({
        groups: {
          sort: [
            "data-until",
            "data-player_id",
            "data-sortA",
            "data-location",
            "data-okay-since",
            "data-unexpected-at",
          ],
        },
      });

      const UNEXPECTED_HIGHLIGHT_MS =
        WarMonitorFeature.intervals.unexpectedHighlight;

      let lastRequestTime = 0;
      const minTimeBetweenRequestsMs =
        WarMonitorFeature.intervals.minTimeBetweenRequests;

      const activeChains = new Map<string, ActiveChainState>();
      const lastAppliedTimestamp = new Map<FactionId, number>();
      let cachedUserIdHashKey: string | null = null;
      let cachedUserIdHash: string | null = null;
      let lastChainHtml = "";
      let isDragging = false;
      let _isSorting = false;
      const memberListObservers: MutationObserver[] = [];

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
        members.clear();
        factionCache.clearAll();
        activeChains.clear();
        unexpectedTransitions.clear();
        okaySinceTimestamps.clear();
        lastAppliedTimestamp.clear();
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
        pageVisible = isVisible();
        // Temporary Torn PDA substitute for focus tracking — see the
        // isTornPda comment above for why and when to remove this branch.
        if (onTornPda) {
          windowFocused = !document.hidden;
          updateWindowFocusClass();
        }
      };
      document.addEventListener("visibilitychange", onVisibilityChange);

      // Listen for window focus changes (ADR-0007). Skipped on Torn PDA,
      // which substitutes tab visibility above instead.
      const onWindowFocus = () => {
        windowFocused = true;
        updateWindowFocusClass();
      };
      const onWindowBlur = () => {
        windowFocused = false;
        updateWindowFocusClass();
      };
      if (!onTornPda) {
        window.addEventListener("focus", onWindowFocus);
        window.addEventListener("blur", onWindowBlur);
      }

      async function copyToClipboard(
        content: string | { html: string },
      ): Promise<boolean> {
        // For rich content, the plaintext fallback is the same raw HTML
        // markup string (not stripped) — a plain-text-only paste target
        // shows literal <a href="..."> tags, but that beats copying nothing.
        const text = typeof content === "string" ? content : content.html;

        // 0. Try a rich HTML+plaintext clipboard write first, if there's
        // HTML to write and the browser supports it. No await happens
        // before this call: Safari drops clipboard write permission across
        // an await.
        if (typeof content !== "string") {
          try {
            if (
              typeof ClipboardItem !== "undefined" &&
              navigator.clipboard?.write
            ) {
              await navigator.clipboard.write([
                new ClipboardItem({
                  "text/html": new Blob([content.html], {
                    type: "text/html",
                  }),
                  "text/plain": new Blob([text], { type: "text/plain" }),
                }),
              ]);
              return true;
            }
          } catch (err) {
            log.error("Failed to copy rich content using clipboard.write", err);
          }
        }

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

      // Builds the "Name - Stat estimate - Attack link" rich copy content
      // (see CONTEXT.md's Total stat estimate entry). The stat estimate
      // segment is omitted whenever data-est-value doesn't parse to a finite
      // positive number: absent (FF Scouter not installed), "" (FF Scouter
      // installed but has no data for this player yet), or garbage all fall
      // through to the same check.
      function buildRichCopyContent(
        name: string,
        id: string,
        li: HTMLLIElement | null,
      ): { html: string } {
        const profileUrl = `https://www.torn.com/profiles.php?XID=${id}`;
        const attackUrl = `https://www.torn.com/page.php?sid=attack&user2ID=${id}`;

        const rawEstimate = Number(li?.getAttribute("data-est-value"));
        const estimate =
          Number.isFinite(rawEstimate) && rawEstimate > 0
            ? formatStatEstimate(rawEstimate)
            : null;
        const middle = estimate ? ` - ${estimate}` : "";

        const html = `<a href="${profileUrl}">${name} [${id}]</a>${middle} - <a href="${attackUrl.replace(/&/g, "&amp;")}">Attack</a>`;

        return { html };
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
        copyBtn.title = "Copy player info";
        // Read back by the delegated click handler below rather than closed
        // over, so this function never creates a per-row listener/closure.
        copyBtn.setAttribute("data-player-id", id);
        copyBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="twse-copy-icon"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        `;

        parent.appendChild(copyBtn);
      }

      // Delegated onto factWarList (stable for the whole monitor session)
      // instead of attached per-button. Torn can replace whole rows (and
      // re-trigger extractAllMemberLis/injectCopyButton for the new ones)
      // without this code ever being told to tear down the previous set; a
      // per-row listener there kept every detached row's button, its click
      // closure, and everything that closure captured (the row's profile
      // link, etc.) reachable indefinitely. A single delegated listener
      // can't leak that way regardless of how many times rows are replaced.
      async function onCopyButtonClick(e: Event) {
        const target = e.target as HTMLElement | null;
        const copyBtn = target?.closest<HTMLButtonElement>(".twse-copy-btn");
        if (!copyBtn) return;
        const id = copyBtn.getAttribute("data-player-id");
        if (!id) return;

        e.preventDefault();
        e.stopPropagation();

        const li = copyBtn.closest("li");
        const atag = li?.querySelector<HTMLAnchorElement>(
          "a[href^='/profiles.php']",
        );

        // Torn always sets this aria-label on the profile link; prefer it over
        // textContent since third-party scripts (e.g. FF Scouter) can inject
        // extra text (estimate values) inside the anchor's descendants.
        const ariaMatch = atag
          ?.getAttribute("aria-label")
          ?.match(/^View profile of (.+)$/);
        const name = ariaMatch
          ? ariaMatch[1].trim()
          : atag?.textContent?.trim() || "";

        const content =
          twseconfig.copy_format === "rich"
            ? buildRichCopyContent(name, id, li)
            : `${name} [${id}]`;

        const success = await copyToClipboard(content);
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
      }

      // Extract faction member list details
      function extractAllMemberLis() {
        memberLis.clear();
        for (const row of getMemberRows()) {
          memberLis.set(row.id, { li: row.li, statusDiv: row.statusDiv });
          injectCopyButton(row.id, row.li);
        }
      }

      function populateCachedStatus(factionId: string) {
        const cached = factionCache.get(factionId);
        if (!cached) return;

        for (const [id, member] of Object.entries(cached)) {
          members.set(id, member);
        }
        log.info(
          `Populated war monitor cache with stored statuses for faction: ${factionId}`,
        );
      }

      function sortMemberList(listElem: Element) {
        let sortedColumn = getSortedColumn(listElem);
        // getSortedColumn is a pure read (torn-war-page.ts); this feature owns
        // everSorted, so it decides for itself whether this result flips it.
        if (
          sortedColumn.column &&
          (sortedColumn.column !== "points" || sortedColumn.order !== "desc")
        ) {
          everSorted = true;
        }
        if (!everSorted) {
          sortedColumn = { column: "status", order: "asc" };
        }

        if (listElem.getAttribute("data-ffscouter-active-filter") === "true") {
          ffscouterSortingDeferred = true;
          return;
        }

        if (sortedColumn.column !== "status") {
          return;
        }

        const lis = Array.from(listElem.childNodes) as HTMLLIElement[];
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

          const sorta = sort_by_attribute(left, right, "data-sortA", 1);
          const sortA_a = parseInt(left.getAttribute("data-sortA") || "1", 10);
          if (sorta !== 0) return sorta;

          const leftLocation = left.getAttribute("data-location") || "";
          const rightLocation = right.getAttribute("data-location") || "";
          if (leftLocation && rightLocation) {
            if (leftLocation < rightLocation) return -1;
            if (leftLocation > rightLocation) return 1;
            return 0;
          }

          // Tier A (unexpected transitions): newest transition first
          if (sortA_a === 0) {
            return sort_by_attribute(left, right, "data-unexpected-at") * -1; // Sort unexpected-at most recent the highest
          }

          // Tier B: oldest okay-since first; expected exits land at bottom ordered by expiry time
          if (sortA_a === 1) {
            const okaysince = sort_by_attribute(left, right, "data-okay-since");
            if (okaysince === 0) {
              const est = sort_by_attribute(left, right, "data-est-value");
              if (est === 0) {
                return sort_by_attribute(left, right, "data-player_id");
              }
              return est * -1; // If we have estimates, sort them descending
            }
            return okaysince;
          }

          // Hospital timers: soonest first
          return sort_by_attribute(left, right, "data-until");
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
          for (const li of sortedLis) fragment.appendChild(li);
          listElem.appendChild(fragment);
        }
      }

      function setupMemberListObservers() {
        for (const obs of memberListObservers) obs.disconnect();
        memberListObservers.length = 0;

        const memberLists = getMemberLists();
        for (let i = 0; i < memberLists.length; i++) {
          const ul = memberLists[i];
          const obs = observeElement(
            ul,
            () => {
              if (_isSorting || !twseconfig.war_sorting) return;
              _isSorting = true;
              sortMemberList(ul);
              _isSorting = false;
            },
            { childList: true },
          );
          memberListObservers.push(obs);
        }
      }

      function calculateFlightTimeRemaining(li: HTMLLIElement): string {
        const earliestArrivalAttr = li.getAttribute("data-earliest-arrival");
        const latestArrivalAttr = li.getAttribute("data-latest-arrival");
        if (!earliestArrivalAttr && !latestArrivalAttr) return "";

        const earliestArrival: TornTimestampSec = parseInt(
          earliestArrivalAttr || "",
          10,
        );
        const latestArrival: TornTimestampSec = parseInt(
          latestArrivalAttr || "",
          10,
        );
        if (Number.isNaN(earliestArrival) && Number.isNaN(latestArrival))
          return "";

        // data-earliest-arrival/data-latest-arrival are Torn-sourced Unix
        // timestamps in seconds; convert our ms clock here, at the comparison.
        const nowSec: TornTimestampSec = getCurrentTime() / 1000;
        if (!Number.isNaN(earliestArrival) && earliestArrival > nowSec) {
          const remaining: DurationSec = Math.round(earliestArrival - nowSec);
          return ` ${calc_delta(remaining, false, false)}`;
        }
        if (!Number.isNaN(latestArrival) && latestArrival > nowSec) {
          const remaining: DurationSec = Math.round(latestArrival - nowSec);
          return ` <${calc_delta(remaining, false, false)}`;
        }

        return " LATE";
      }

      // Returns SHA-256(apiKey) as a hex string, cached per key value.
      async function getUserIdHash(): Promise<string | null> {
        const key = twseconfig.apiKey;
        if (!key) return null;
        if (cachedUserIdHashKey === key) return cachedUserIdHash;
        const encoded = new TextEncoder().encode(key);
        const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
        const hash = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        cachedUserIdHashKey = key;
        cachedUserIdHash = hash;
        return hash;
      }

      // Applies a FactionResponse to members and activeChains.
      // Skips data that is not newer than the last applied timestamp for this faction.
      function applyFactionData(
        factionId: FactionId,
        data: FactionResponse,
      ): void {
        if (data.timestamp !== undefined) {
          const last = lastAppliedTimestamp.get(factionId) ?? 0;
          if (data.timestamp <= last) return;
          lastAppliedTimestamp.set(factionId, data.timestamp);
        }

        if (data.members) {
          const reqTime = Date.now();
          const factionMembers: Record<string, FactionMember> = {};

          for (const memberData of data.members) {
            const id = String(memberData.id);
            memberData.status.last_req_time = reqTime;

            members.set(id, memberData);
            factionMembers[id] = memberData;
          }

          factionCache.set(factionId, factionMembers);
        }

        if (data.chain) {
          activeChains.set(factionId, {
            current: data.chain.current,
            max: data.chain.max,
            timeout: data.chain.timeout,
            modifier: data.chain.modifier,
            apiReceivedAt: getCurrentTime(),
            cooldown: data.chain.cooldown || 0,
            end: data.chain.end,
          });
        }
      }

      // Primary update polling executor
      async function updateStatuses() {
        if (!running) return;

        const factionIds = getFactionIds();
        if (factionIds.length === 0) return;

        const now = Date.now();
        if (now - lastRequestTime < minTimeBetweenRequestsMs) return;
        lastRequestTime = now;

        const userIdHash = await getUserIdHash();

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

          applyFactionData(factionId, data);

          if (userIdHash !== null) {
            twseClient.submit(factionId, {
              user_id_hash: userIdHash,
              torn_response: data,
            });
          }
        }
      }

      // Periodic UI updates (attributes & layout settings)
      const SORT_GROUP_TO_SORT_A: Record<SortGroup, string> = {
        [SortGroup.UnexpectedOkay]: "0",
        [SortGroup.ExpectedOkay]: "1",
        [SortGroup.Hospitalized]: "2",
        [SortGroup.Incoming]: "3",
        [SortGroup.Abroad]: "4",
        [SortGroup.Outgoing]: "5",
        [SortGroup.Traveling]: "6",
      };

      // Applies a MemberClassification decision to the DOM: the sort epoch
      // attributes sortMemberList's comparator reads, the row's display content,
      // and the highlight/overridden flags. The literal display text (location
      // arrows, countdowns) is presentation built here, not part of
      // classifyMember's decision (see classify-member.ts).
      function applyClassification(
        li: HTMLLIElement,
        statusDiv: HTMLDivElement,
        status: FactionMemberStatus,
        classification: MemberClassification,
        tornNow: TornTimestampMs,
      ): void {
        domWriter.setAttr(
          li,
          "data-sortA",
          SORT_GROUP_TO_SORT_A[classification.sortGroup],
        );

        const isTravelState =
          status.state === "Traveling" || status.state === "Abroad";

        let dataLocation = "";
        let overridden = false;

        switch (classification.sortGroup) {
          case SortGroup.Abroad: {
            const content = shorten_destination(
              status.description.split("In ")[1],
            );
            dataLocation = content;
            domWriter.setStyle(statusDiv, "--twse-content", `"${content}"`);
            overridden = true;
            break;
          }
          case SortGroup.Outgoing: {
            if (classification.route) {
              dataLocation = `► ${classification.route.to}`;
              const remaining = calculateFlightTimeRemaining(li);
              domWriter.setStyle(
                statusDiv,
                "--twse-content",
                `"${dataLocation}${remaining}"`,
              );
              overridden = true;
            }
            break;
          }
          case SortGroup.Incoming: {
            if (classification.route) {
              dataLocation = `◄ ${classification.route.from}`;
              const remaining = calculateFlightTimeRemaining(li);
              domWriter.setStyle(
                statusDiv,
                "--twse-content",
                `"${dataLocation}${remaining}"`,
              );
              overridden = true;
            }
            break;
          }
          case SortGroup.Traveling: {
            if (isTravelState) {
              dataLocation = "Traveling";
              domWriter.setStyle(
                statusDiv,
                "--twse-content",
                `"${dataLocation}"`,
              );
              overridden = true;
            }
            break;
          }
          case SortGroup.Hospitalized: {
            // Reuse the same tornNow classifyMember decided isNearExpiry from
            // (converting ms to seconds here, at the comparison), so the
            // countdown text and the highlight threshold never disagree.
            const timeRemaining = Math.round(
              (status.until ?? 0) - tornNow / 1000,
            );
            if (timeRemaining > 0) {
              const timeStr = calc_delta(timeRemaining);
              domWriter.setStyle(statusDiv, "--twse-content", `"${timeStr}"`);
              overridden = true;
            }
            break;
          }
          default:
            break;
        }

        domWriter.setAttr(li, "data-location", dataLocation);

        // data-okay-since/data-unexpected-at are the sort epochs sortMemberList's
        // comparator reads; classifyMember owns the decision, this just persists it.
        const okaySince = classification.nextTransitionState.okaySince;
        domWriter.setAttr(
          li,
          "data-okay-since",
          okaySince === null ? "" : String(okaySince),
        );

        const unexpectedAt =
          classification.nextTransitionState.unexpectedSince ?? 0;
        domWriter.setAttr(li, "data-unexpected-at", String(unexpectedAt));

        domWriter.setAttr(
          statusDiv,
          STATUS_DIFFERS,
          classification.isUnexpectedHighlighted ? "true" : "false",
        );

        // TRAVELING/HIGHLIGHT are hospital-specific indicators; the Traveling/Abroad
        // case never touches them, leaving whatever value a prior hospital stint left.
        if (!isTravelState) {
          if (classification.sortGroup === SortGroup.Hospitalized) {
            domWriter.setAttr(
              statusDiv,
              TRAVELING,
              status.description.includes("In a") ? "true" : "false",
            );
          } else {
            domWriter.setAttr(statusDiv, TRAVELING, "false");
          }
          domWriter.setAttr(
            statusDiv,
            HIGHLIGHT,
            classification.isNearExpiry ? "true" : "false",
          );
        }

        domWriter.setAttr(
          statusDiv,
          "data-twse-overridden",
          overridden ? "true" : "false",
        );
      }

      function watch() {
        memberLis.forEach((elem, id) => {
          const li = elem.li;
          const statusDiv = elem.statusDiv;
          if (!li || !statusDiv) return;

          const member = members.get(id);
          if (!member || !running) {
            domWriter.setAttr(statusDiv, "data-twse-overridden", "false");
            return;
          }
          const status = member.status;

          domWriter.setAttr(li, "data-until", String(status.until ?? 0));
          domWriter.setAttr(li, "data-player_id", String(id));
          domWriter.setAttr(
            li,
            "data-twse-last-action-timestamp",
            String(member.last_action?.timestamp ?? 0),
          );

          const canonicalStatus = parseCanonicalStatus(statusDiv);
          const transitionState: TransitionState = {
            unexpectedSince: unexpectedTransitions.get(id) ?? null,
            okaySince: okaySinceTimestamps.get(id) ?? null,
          };
          // `browserNow` stamps our own session bookkeeping (transition
          // timestamps, highlight window) — always Date.now(), never the
          // Torn-API clock. `tornNow` is only for comparing against
          // status.until, a Torn API timestamp, so it (and only it) uses Torn
          // Server Time via getCurrentTime() — both are ms; the seconds
          // conversion against status.until happens at the comparison site.
          const browserNow: TimestampMs = Date.now();
          const tornNow: TornTimestampMs = getCurrentTime();
          const classification = classifyMember(
            status,
            canonicalStatus,
            transitionState,
            browserNow,
            tornNow,
            {
              unexpectedHighlightMs: UNEXPECTED_HIGHLIGHT_MS,
              nearExpiryThresholdSec:
                WarMonitorFeature.intervals.nearExpiryThresholdSec,
              expectedExpiryToleranceSec:
                WarMonitorFeature.intervals.expectedExpiryToleranceSec,
            },
          );

          if (classification.nextTransitionState.unexpectedSince === null) {
            unexpectedTransitions.delete(id);
          } else {
            unexpectedTransitions.set(
              id,
              classification.nextTransitionState.unexpectedSince,
            );
          }
          if (classification.nextTransitionState.okaySince === null) {
            okaySinceTimestamps.delete(id);
          } else {
            okaySinceTimestamps.set(
              id,
              classification.nextTransitionState.okaySince,
            );
          }

          applyClassification(li, statusDiv, status, classification, tornNow);
        });

        // Commit all writes at once
        const dirtyGroups = domWriter.flush();

        // Handle custom sorting routine
        if (
          twseconfig.war_sorting &&
          (dirtyGroups.has("sort") || forceSortNextTick)
        ) {
          forceSortNextTick = false;
          _isSorting = true;
          const memberLists = getMemberLists();
          for (let i = 0; i < memberLists.length; i++) {
            sortMemberList(memberLists[i]);
          }
          _isSorting = false;
        }

        // If FF Scouter sorted our stuff but is no longer actively doing so, we should force a sort in next watch cycle
        if (ffscouterSortingDeferred) {
          const memberLists = getMemberLists();
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
            forceSortNextTick = true;
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
        // chain.cooldown/chain.end are Torn-sourced Unix timestamps in
        // seconds; convert our ms clock here, at the comparison.
        const nowSec: TornTimestampSec = getCurrentTime() / 1000;

        activeChains.forEach((chain) => {
          let formattedTime = "";
          let timerClass = "okay";
          let countClass = "";

          if (chain.cooldown > 0) {
            // 1. Cooldown state (Broken chain); cooldown is a Unix timestamp in v2
            const remainingCooldown: DurationSec = Math.max(
              0,
              chain.cooldown - nowSec,
            );
            formattedTime = formatChainCooldown(remainingCooldown);
            timerClass = "cooldown";
            countClass = "cooldown";
          } else if (chain.current === 0 || !chain.end || chain.end === 0) {
            // 2. Non-existent/not running chain state
            formattedTime = "-:--";
            timerClass = "okay"; // Default standard okay color
          } else {
            // 3. Active running chain countdown (never use timeout; server strips it)
            const remaining: DurationSec = chain.end - nowSec;

            if (remaining < 0) {
              formattedTime = formatChainTimeout(remaining);
              timerClass = "negative";
            } else if (remaining < 60) {
              formattedTime = formatChainTimeout(remaining);
              timerClass = "urgent";
            } else {
              formattedTime = formatChainTimeout(remaining);
            }
          }

          html += `
            <div class="twse-chain-row">
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
        // Torn can replace the whole .descriptions container again (re-firing
        // descriptionsObserver below) before a previous call here ever hit
        // its own foundWar-and-injectedToggle disconnect. Reassigning
        // innerDescriptionsObserver just below without this would orphan
        // that still-active observer, which keeps the entire old (now
        // detached) container reachable via normal parent->child DOM
        // references until observeElement's own isConnected poll notices
        // and disconnects it (up to 10s later, see utils/dom.ts) — this
        // just closes that window immediately instead of waiting on it.
        innerDescriptionsObserver?.disconnect();
        innerDescriptionsObserver = null;

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
            setupMemberListObservers();
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
          setupMemberListObservers();
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
        factWarList.addEventListener("click", onCopyButtonClick);
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
      }, WarMonitorFeature.intervals.poll);

      // Set countdown draw timers (updates clock draw variables every 500ms)
      const watchInterval = setInterval(() => {
        pageVisible = isVisible();
        if (foundWar && running && pageVisible) {
          watch();
        }
      }, WarMonitorFeature.intervals.watch);

      let cacheTimer: NodeJS.Timeout | null = null;

      // Poll TWSE Server 1 sec after each poll for fresher data contributed by other script users
      const queryCache = async () => {
        if (cacheTimer) {
          clearTimeout(cacheTimer);
        }
        cacheTimer = null;
        try {
          if (!running || !foundWar) return;
          for (const factionId of getFactionIds()) {
            const data = await twseClient.fetchLatest(factionId);
            if (data) applyFactionData(factionId, data);
          }
        } finally {
          if (!cacheTimer) {
            cacheTimer = setTimeout(queryCache, 1_000);
          }
        }
      };
      queryCache();

      stopMonitor = () => {
        active = false;
        running = false;

        // 1. Clear intervals
        clearInterval(pollingInterval);
        clearInterval(watchInterval);
        if (cacheTimer) {
          clearTimeout(cacheTimer);
          cacheTimer = null;
        }

        // 2. Disconnect observers
        if (descriptionsObserver) {
          descriptionsObserver.disconnect();
        }
        if (innerDescriptionsObserver) {
          innerDescriptionsObserver.disconnect();
        }
        for (const obs of memberListObservers) obs.disconnect();
        memberListObservers.length = 0;

        // 3. Remove event listeners
        window.removeEventListener("twse-config-updated", onConfigUpdated);
        window.removeEventListener("twse-clear-cache", onClearCache);
        window.removeEventListener("resize", clampToScreen);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        if (!onTornPda) {
          window.removeEventListener("focus", onWindowFocus);
          window.removeEventListener("blur", onWindowBlur);
        }
        factWarList?.removeEventListener("click", onCopyButtonClick);

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
