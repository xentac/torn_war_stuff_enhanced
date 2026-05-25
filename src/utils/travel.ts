export interface FlightRoute {
  from: string;
  to: string;
}

const DEST_TABLE = new Map<string, string>([
  ["mexico", "MX"],
  ["cayman islands", "CI"],
  ["canada", "CA"],
  ["hawaii", "HI"],
  ["united kingdom", "UK"],
  ["argentina", "AR"],
  ["switzerland", "SW"],
  ["japan", "JP"],
  ["china", "CN"],
  ["uae", "UAE"],
  ["south africa", "SA"],
  ["torn", "TC"],
]);

/**
 * Map longer country/destination names into standard 2-letter codes.
 */
export function shorten_destination(dest: string): string {
  return DEST_TABLE.get(dest.toLowerCase().trim()) ?? dest;
}

const TRAVELING_REGEX = /Traveling from ([\S ]+) to ([\S ]+)/;

/**
 * Extracts and maps standard destinations from travel status text.
 */
export function extract_destinations_from_description(
  description: string,
): FlightRoute | null {
  if (!description.startsWith("Traveling from")) {
    return null;
  }

  const match = TRAVELING_REGEX.exec(description);
  if (!match) {
    return null;
  }

  return {
    from: shorten_destination(match[1]),
    to: shorten_destination(match[2]),
  };
}
