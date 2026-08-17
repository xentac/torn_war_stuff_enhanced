export interface MemberRow {
  id: string;
  li: HTMLLIElement;
  statusDiv: HTMLDivElement | null;
  /** The <ul> this row came from — pair with getFactionMemberLists() to resolve a faction id, if needed. */
  list: Element;
}

export interface SortedColumn {
  column: "member" | "level" | "points" | "status" | null;
  order: "asc" | "desc" | null;
}

/** Every <ul class="members-list"> on the page right now. */
export function getMemberLists(): Element[] {
  return Array.from(document.querySelectorAll("ul.members-list"));
}

export interface FactionMemberList {
  factionId: string;
  list: Element;
}

/**
 * Pairs each member list with its faction id, parsed from that list's
 * <a href="/factions.php?ID=...">. Skips any list where that anchor is
 * missing or unparseable.
 */
export function getFactionMemberLists(): FactionMemberList[] {
  const result: FactionMemberList[] = [];
  for (const list of getMemberLists()) {
    const anchor = list.querySelector<HTMLAnchorElement>(
      "a[href^='/factions.php']",
    );
    if (!anchor) continue;
    const id = parseHrefParam(anchor, "ID");
    if (!id) continue;
    result.push({ factionId: id, list });
  }
  return result;
}

/**
 * Faction id parsed from each member list's <a href="/factions.php?ID=...">.
 * Skips any list where that anchor is missing or unparseable.
 */
export function getFactionIds(): string[] {
  return getFactionMemberLists().map((f) => f.factionId);
}

export type Presence = "online" | "idle" | "offline";

const PRESENCE_SUFFIXES: [suffix: string, presence: Presence][] = [
  [" is online", "online"],
  [" is idle", "idle"],
  [" is offline", "offline"],
];

/**
 * A member row's online/idle/offline presence, read from the aria-label Torn
 * writes on the row's status icon ("{name} is online|idle|offline") -
 * independent of canonical status (CONTEXT.md "Presence"), sourced directly
 * from the live DOM rather than the Torn API for freshness. Checks every
 * aria-label-bearing descendant (not just the first) since the row also
 * carries unrelated aria-labels (faction tag, profile link, honor badge).
 * Returns null if no descendant's label matches the expected suffix.
 */
export function parsePresence(li: HTMLLIElement): Presence | null {
  const labeled = li.querySelectorAll<HTMLElement>("[aria-label]");
  for (const el of Array.from(labeled)) {
    const label = el.getAttribute("aria-label");
    if (!label) continue;
    for (const [suffix, presence] of PRESENCE_SUFFIXES) {
      if (label.endsWith(suffix)) return presence;
    }
  }
  return null;
}

export interface PresenceCounts {
  online: number;
  idle: number;
  offline: number;
}

/**
 * Every <li class="enemy"|"your"> row across every member list, with its
 * member id (parsed from <a href="/profiles.php?XID=...">) and status div.
 * Skips any row where the anchor is missing or the id is unparseable. Does
 * NOT require the row's own list to have a resolvable faction id (unlike
 * getFactionMemberLists) — this is the primary member-tracking extraction
 * used for classification, sorting, etc., and should stay available even if
 * a list's faction anchor is momentarily unparseable.
 */
export function getMemberRows(): MemberRow[] {
  const rows: MemberRow[] = [];
  for (const list of getMemberLists()) {
    const lis = list.querySelectorAll<HTMLLIElement>("li.enemy, li.your");
    for (const li of Array.from(lis)) {
      const anchor = li.querySelector<HTMLAnchorElement>(
        "a[href^='/profiles.php']",
      );
      if (!anchor) continue;
      const id = parseHrefParam(anchor, "XID");
      if (!id) continue;
      rows.push({
        id,
        li,
        statusDiv: li.querySelector<HTMLDivElement>("div.status"),
        list,
      });
    }
  }
  return rows;
}

/**
 * Reads the sort-indicator CSS classes from `memberList`'s parent to report
 * which column (if any) the user has manually sorted by, and in which
 * direction. Pure read — does not mutate any caller state.
 */
export function getSortedColumn(memberList: Element): SortedColumn {
  const parent = memberList.parentNode as Element | null;
  if (!parent) return { column: null, order: null };

  const memberDiv = parent.querySelector("div.member div");
  const levelDiv = parent.querySelector("div.level div");
  const pointsDiv = parent.querySelector("div.points div");
  const statusDiv = parent.querySelector("div.status div");

  let column: SortedColumn["column"] = null;
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

  const order: SortedColumn["order"] = column
    ? classname.includes("asc__")
      ? "asc"
      : "desc"
    : null;

  return { column, order };
}

/**
 * anchor.href in production is a fully-resolved absolute URL; in tests it may
 * be a bare relative path like "/profiles.php?XID=123" — resolve against a
 * base so both parse correctly. Returns null if the param is absent or the
 * href can't be parsed.
 */
function parseHrefParam(
  anchor: HTMLAnchorElement,
  paramName: string,
): string | null {
  try {
    return new URL(anchor.href, "https://www.torn.com").searchParams.get(
      paramName,
    );
  } catch {
    return null;
  }
}
