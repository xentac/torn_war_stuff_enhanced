export interface MemberRow {
  id: string;
  li: HTMLLIElement;
  statusDiv: HTMLDivElement | null;
}

export interface SortedColumn {
  column: "member" | "level" | "points" | "status" | null;
  order: "asc" | "desc" | null;
}

/** Every <ul class="members-list"> on the page right now. */
export function getMemberLists(): Element[] {
  return Array.from(document.querySelectorAll("ul.members-list"));
}

/**
 * Faction id parsed from each member list's <a href="/factions.php?ID=...">.
 * Skips any list where that anchor is missing or unparseable.
 */
export function getFactionIds(): string[] {
  const ids: string[] = [];
  for (const list of getMemberLists()) {
    const anchor = list.querySelector<HTMLAnchorElement>(
      "a[href^='/factions.php']",
    );
    if (!anchor) continue;
    const id = parseHrefParam(anchor, "ID");
    if (id) ids.push(id);
  }
  return ids;
}

/**
 * Every <li class="enemy"|"your"> row across every member list, with its
 * member id (parsed from <a href="/profiles.php?XID=...">) and status div.
 * Skips any row where the anchor is missing or the id is unparseable.
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
