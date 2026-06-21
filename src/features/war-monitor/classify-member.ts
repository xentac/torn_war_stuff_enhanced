import { extract_destinations_from_description } from "@utils/travel";
import type {
  DurationMs,
  DurationSec,
  FactionMemberStatus,
  TimestampMs,
  TornTimestampMs,
} from "@utils/types";

/**
 * Canonical status (ADR-0001) condensed from the DOM's status div: what Torn's
 * own page currently shows for this member, independent of the Torn API.
 * "Unknown" covers a transient DOM read — e.g. a class toggled off before new
 * text/class is applied — that shouldn't yet be treated as Okay.
 */
export type CanonicalStatus =
  | "Traveling"
  | "HospitalOrJail"
  | "Okay"
  | "Unknown";

/**
 * The sort group (CONTEXT.md "Sort model") a member's row belongs to, ahead of
 * any within-group tie-break. Tier A and Tier B (ADR-0003) are the two sort
 * groups used within the Okay section; the rest order non-Okay states.
 */
export enum SortGroup {
  /** Tier A: an unexpected transition (ADR-0002) happened this session. */
  UnexpectedOkay = "UnexpectedOkay",
  /** Tier B: stable Okay, no unexpected transition this session. */
  ExpectedOkay = "ExpectedOkay",
  Hospitalized = "Hospitalized",
  Incoming = "Incoming",
  Abroad = "Abroad",
  Outgoing = "Outgoing",
  Traveling = "Traveling",
}

/**
 * Per-member session state the caller owns (in Maps keyed by member id) and
 * feeds back in on the next tick. classifyMember never mutates this directly
 * — it returns the next value via MemberClassification.nextTransitionState.
 */
export interface TransitionState {
  /**
   * ms epoch (local clock) since this member's most recent unexpected
   * transition (UnexpectedOkay/Tier A sort key, ADR-0002/ADR-0003), or null
   * if none this session. Always stamped from browserNow — it's the only
   * field compared directly against browserNow, in isUnexpectedHighlighted.
   */
  unexpectedSince: TimestampMs | null;
  /**
   * ms epoch since this member has been continuously, stably Okay (the
   * ExpectedOkay/Tier B sort key, ADR-0003), or null if not in that group.
   * Primarily a Torn-clock instant — the hospital/jail timer's scheduled end
   * time, so exits sort deterministically regardless of when we happened to
   * poll — falling back to browserNow when there's no Torn-given instant to
   * anchor to (member was already Okay with no event marking when). Only
   * ever compared against other okaySince values for sorting, never against
   * either clock directly, so the two sources mix safely here.
   */
  okaySince: TornTimestampMs | null;
}

export interface ClassificationConfig {
  /** Unexpected-transition highlight window (CONTEXT.md). */
  unexpectedHighlightMs: DurationMs;
  /** Near-expiry highlight threshold (CONTEXT.md). */
  nearExpiryThresholdSec: DurationSec;
}

export interface MemberClassification {
  sortGroup: SortGroup;
  route: { from: string; to: string } | null;
  nextTransitionState: TransitionState;
  isUnexpectedHighlighted: boolean;
  isNearExpiry: boolean;
}

/**
 * What each classify* branch decides on its own, before classifyMember adds
 * isUnexpectedHighlighted — the one computation shared by every branch, since
 * it only depends on config.unexpectedHighlightMs, which no branch otherwise needs.
 */
type ClassificationDecision = Omit<
  MemberClassification,
  "isUnexpectedHighlighted"
>;

export function parseCanonicalStatus(
  statusDiv: HTMLDivElement,
): CanonicalStatus {
  if (
    statusDiv.classList.contains("traveling") ||
    statusDiv.classList.contains("abroad")
  ) {
    return "Traveling";
  }
  if (
    statusDiv.classList.contains("hospital") ||
    statusDiv.classList.contains("jail")
  ) {
    return "HospitalOrJail";
  }
  if (statusDiv.textContent === "Okay") {
    return "Okay";
  }
  return "Unknown";
}

/**
 * Two different clocks, never substituted for each other: `browserNow` (ms,
 * Date.now()) stamps and compares our own session bookkeeping —
 * unexpectedSince and the highlight window. `tornNow` (ms, getCurrentTime())
 * is Torn Server Time — Torn's own server-synchronized clock — used to
 * compare against status.until, a Torn API timestamp in seconds — the
 * seconds conversion happens at the comparison site, not before.
 */
export function classifyMember(
  status: FactionMemberStatus,
  canonicalStatus: CanonicalStatus,
  transitionState: TransitionState,
  browserNow: TimestampMs,
  tornNow: TornTimestampMs,
  config: ClassificationConfig,
): MemberClassification {
  let decision: ClassificationDecision;

  if (status.state === "Hospital" || status.state === "Jail") {
    decision = classifyHospitalOrJail(
      status,
      canonicalStatus,
      transitionState,
      browserNow,
      tornNow,
      config.nearExpiryThresholdSec,
    );
  } else if (status.state === "Traveling" || status.state === "Abroad") {
    decision = classifyTraveling(
      status,
      canonicalStatus,
      transitionState,
      browserNow,
    );
  } else {
    decision = classifyOkay(transitionState, browserNow);
  }

  return {
    ...decision,
    isUnexpectedHighlighted: isUnexpectedHighlighted(
      decision.nextTransitionState,
      browserNow,
      config,
    ),
  };
}

// status.state is "Okay" or one of the rarer API states (Awoken, Dormant,
// Fallen, Federal, Unknown) we don't special-case — all land here, carrying
// forward whichever sort group (ExpectedOkay/UnexpectedOkay) they already had.
function classifyOkay(
  transitionState: TransitionState,
  browserNow: TimestampMs,
): ClassificationDecision {
  const sortGroup = carryForwardSortGroup(transitionState);

  // No Torn-given instant marks when this member became Okay (no hospital/jail
  // exit triggered it), so fall back to browserNow — see TransitionState.okaySince.
  const okaySince =
    sortGroup === SortGroup.ExpectedOkay && transitionState.okaySince === null
      ? browserNow
      : transitionState.okaySince;

  return {
    sortGroup,
    route: null,
    nextTransitionState: {
      unexpectedSince: transitionState.unexpectedSince,
      okaySince,
    },
    isNearExpiry: false,
  };
}

function classifyHospitalOrJail(
  status: FactionMemberStatus,
  canonicalStatus: CanonicalStatus,
  transitionState: TransitionState,
  browserNow: TimestampMs,
  tornNow: TornTimestampMs,
  nearExpiryThresholdSec: DurationSec,
): ClassificationDecision {
  // status.until is a Torn API Unix timestamp in seconds (ADR-0004); convert
  // tornNow (ms) to seconds here, at the comparison, rather than carrying a
  // separate seconds-typed clock value through the call chain.
  const timeRemainingSec: DurationSec = Math.round(
    (status.until ?? 0) - tornNow / 1000,
  );

  if (canonicalStatus === "HospitalOrJail") {
    return {
      sortGroup: SortGroup.Hospitalized,
      route: null,
      nextTransitionState: { unexpectedSince: null, okaySince: null },
      isNearExpiry:
        timeRemainingSec > 0 && timeRemainingSec < nearExpiryThresholdSec,
    };
  }

  if (timeRemainingSec >= 0) {
    // Unexpected transition: API still shows time remaining but DOM hasn't
    // confirmed hospital/jail — medded, revived, or an early jail release.
    return {
      sortGroup: SortGroup.UnexpectedOkay,
      route: null,
      nextTransitionState: {
        unexpectedSince: transitionState.unexpectedSince ?? browserNow,
        okaySince: transitionState.okaySince,
      },
      isNearExpiry: false,
    };
  }

  // Expected exit: timer has elapsed and DOM confirms Okay. Sort epoch is the
  // hospital expiry time (Torn clock) so earlier-expiring members sort above
  // later ones — deterministic regardless of when we happened to poll.
  return {
    sortGroup: SortGroup.ExpectedOkay,
    route: null,
    nextTransitionState: {
      unexpectedSince: null,
      okaySince: (status.until ?? 0) * 1000,
    },
    isNearExpiry: false,
  };
}

function classifyTraveling(
  status: FactionMemberStatus,
  canonicalStatus: CanonicalStatus,
  transitionState: TransitionState,
  browserNow: TimestampMs,
): ClassificationDecision {
  if (canonicalStatus === "Traveling") {
    const nextTransitionState: TransitionState = {
      unexpectedSince: null,
      okaySince: null,
    };

    if (status.description.includes("In ")) {
      return {
        sortGroup: SortGroup.Abroad,
        route: null,
        nextTransitionState,
        isNearExpiry: false,
      };
    }

    const route = extract_destinations_from_description(status.description);
    if (route?.from === "TC") {
      return {
        sortGroup: SortGroup.Outgoing,
        route,
        nextTransitionState,
        isNearExpiry: false,
      };
    }
    if (route?.to === "TC") {
      return {
        sortGroup: SortGroup.Incoming,
        route,
        nextTransitionState,
        isNearExpiry: false,
      };
    }
    return {
      sortGroup: SortGroup.Traveling,
      route: route ?? null,
      nextTransitionState,
      isNearExpiry: false,
    };
  }

  if (canonicalStatus === "Okay") {
    // Unexpected transition: API still says traveling but DOM shows landed.
    return {
      sortGroup: SortGroup.UnexpectedOkay,
      route: null,
      nextTransitionState: {
        unexpectedSince: transitionState.unexpectedSince ?? browserNow,
        okaySince: transitionState.okaySince,
      },
      isNearExpiry: false,
    };
  }

  // Unknown (transient DOM read) or an unexpected HospitalOrJail combination:
  // leave transition state untouched, carry forward the prior sort group.
  return {
    sortGroup: carryForwardSortGroup(transitionState),
    route: null,
    nextTransitionState: transitionState,
    isNearExpiry: false,
  };
}

function carryForwardSortGroup(transitionState: TransitionState): SortGroup {
  return transitionState.unexpectedSince
    ? SortGroup.UnexpectedOkay
    : SortGroup.ExpectedOkay;
}

function isUnexpectedHighlighted(
  transitionState: TransitionState,
  browserNow: TimestampMs,
  config: ClassificationConfig,
): boolean {
  return (
    transitionState.unexpectedSince !== null &&
    browserNow - transitionState.unexpectedSince < config.unexpectedHighlightMs
  );
}
