import type { FactionMemberStatus, TornTimestampSec } from "@utils/types";
import { describe, expect, it } from "vitest";
import type { ClassificationConfig, TransitionState } from "./classify-member";
import {
  classifyMember,
  parseCanonicalStatus,
  SortGroup,
} from "./classify-member";

function fakeStatusDiv(classNames: string[], textContent: string) {
  return {
    classList: { contains: (cls: string) => classNames.includes(cls) },
    textContent,
  } as unknown as HTMLDivElement;
}

const NO_TRANSITION: TransitionState = {
  unexpectedSince: null,
  okaySince: null,
};

const CONFIG: ClassificationConfig = {
  unexpectedHighlightMs: 10_000,
  nearExpiryThresholdSec: 300,
  expectedExpiryToleranceSec: 2,
};

function okayStatus(): FactionMemberStatus {
  return { state: "Okay", description: "Okay", until: null };
}

function hospitalStatus(untilSec: TornTimestampSec): FactionMemberStatus {
  return { state: "Hospital", description: "In Hospital", until: untilSec };
}

function jailStatus(untilSec: TornTimestampSec): FactionMemberStatus {
  return { state: "Jail", description: "In Jail", until: untilSec };
}

function travelingStatus(description: string): FactionMemberStatus {
  return { state: "Traveling", description, until: null };
}

describe("parseCanonicalStatus", () => {
  it("returns Traveling when the status div has the traveling class", () => {
    expect(parseCanonicalStatus(fakeStatusDiv(["traveling"], ""))).toBe(
      "Traveling",
    );
  });

  it("returns Traveling when the status div has the abroad class", () => {
    expect(parseCanonicalStatus(fakeStatusDiv(["abroad"], ""))).toBe(
      "Traveling",
    );
  });

  it("returns HospitalOrJail when the status div has the hospital class", () => {
    expect(parseCanonicalStatus(fakeStatusDiv(["hospital"], ""))).toBe(
      "HospitalOrJail",
    );
  });

  it("returns HospitalOrJail when the status div has the jail class", () => {
    expect(parseCanonicalStatus(fakeStatusDiv(["jail"], ""))).toBe(
      "HospitalOrJail",
    );
  });

  it("returns Okay when no special class is present and text reads exactly Okay", () => {
    expect(parseCanonicalStatus(fakeStatusDiv([], "Okay"))).toBe("Okay");
  });

  it("returns Unknown when no special class is present and text isn't exactly Okay", () => {
    expect(
      parseCanonicalStatus(fakeStatusDiv([], "Okay (estimate: 95%)")),
    ).toBe("Unknown");
  });
});

describe("classifyMember", () => {
  it("places a stable Okay member with no transition history in ExpectedOkay and stamps okaySince", () => {
    const now = 1_700_000_000_000;
    const result = classifyMember(
      okayStatus(),
      "Okay",
      NO_TRANSITION,
      now,
      now,
      CONFIG,
    );

    expect(result.sortGroup).toBe(SortGroup.ExpectedOkay);
    expect(result.nextTransitionState).toEqual({
      unexpectedSince: null,
      okaySince: now,
    });
    expect(result.route).toBeNull();
    expect(result.isUnexpectedHighlighted).toBe(false);
    expect(result.isNearExpiry).toBe(false);
  });

  it("does not re-stamp okaySince for a member already known to be stably Okay", () => {
    const now = 1_700_000_000_000;
    const result = classifyMember(
      okayStatus(),
      "Okay",
      { unexpectedSince: null, okaySince: 1_699_999_000_000 },
      now,
      now,
      CONFIG,
    );

    expect(result.nextTransitionState.okaySince).toBe(1_699_999_000_000);
  });

  it("keeps a member in UnexpectedOkay once flagged, without touching okaySince", () => {
    const now = 1_700_000_000_000;
    const result = classifyMember(
      okayStatus(),
      "Okay",
      { unexpectedSince: now - 5_000, okaySince: null },
      now,
      now,
      CONFIG,
    );

    expect(result.sortGroup).toBe(SortGroup.UnexpectedOkay);
    expect(result.nextTransitionState).toEqual({
      unexpectedSince: now - 5_000,
      okaySince: null,
    });
  });

  it("is unexpectedly highlighted while inside the highlight window", () => {
    const now = 1_700_000_000_000;
    const result = classifyMember(
      okayStatus(),
      "Okay",
      { unexpectedSince: now - 9_999, okaySince: null },
      now,
      now,
      CONFIG,
    );

    expect(result.isUnexpectedHighlighted).toBe(true);
  });

  it("is no longer highlighted once the highlight window has fully elapsed", () => {
    const now = 1_700_000_000_000;
    const result = classifyMember(
      okayStatus(),
      "Okay",
      {
        unexpectedSince: now - CONFIG.unexpectedHighlightMs,
        okaySince: null,
      },
      now,
      now,
      CONFIG,
    );

    expect(result.isUnexpectedHighlighted).toBe(false);
  });
});

describe("classifyMember — Hospital/Jail, DOM confirms (canonicalStatus HospitalOrJail)", () => {
  const now = 1_700_000_000_000;
  const nowSec = now / 1000;

  it("is Hospitalized with no near-expiry highlight when plenty of time remains", () => {
    const result = classifyMember(
      hospitalStatus(nowSec + 1_000),
      "HospitalOrJail",
      { unexpectedSince: now - 1_000, okaySince: 123 },
      now,
      now,
      CONFIG,
    );

    expect(result.sortGroup).toBe(SortGroup.Hospitalized);
    expect(result.nextTransitionState).toEqual({
      unexpectedSince: null,
      okaySince: null,
    });
    expect(result.isNearExpiry).toBe(false);
  });

  it("is near-expiry highlighted under the configured threshold", () => {
    const result = classifyMember(
      hospitalStatus(nowSec + 100),
      "HospitalOrJail",
      NO_TRANSITION,
      now,
      now,
      CONFIG,
    );

    expect(result.isNearExpiry).toBe(true);
  });

  it("is not near-expiry highlighted at exactly zero time remaining", () => {
    const result = classifyMember(
      hospitalStatus(nowSec),
      "HospitalOrJail",
      NO_TRANSITION,
      now,
      now,
      CONFIG,
    );

    expect(result.isNearExpiry).toBe(false);
  });

  it("is not near-expiry highlighted once time remaining has gone negative", () => {
    const result = classifyMember(
      hospitalStatus(nowSec - 5),
      "HospitalOrJail",
      NO_TRANSITION,
      now,
      now,
      CONFIG,
    );

    expect(result.isNearExpiry).toBe(false);
  });
});

describe("classifyMember — Hospital/Jail, DOM hasn't confirmed (canonicalStatus Okay/Unknown/Traveling)", () => {
  const now = 1_700_000_000_000;
  const nowSec = now / 1000;

  it("flags an unexpected transition (medded/revived/early release) when time still remains", () => {
    const result = classifyMember(
      hospitalStatus(nowSec + 500),
      "Okay",
      NO_TRANSITION,
      now,
      now,
      CONFIG,
    );

    expect(result.sortGroup).toBe(SortGroup.UnexpectedOkay);
    expect(result.nextTransitionState).toEqual({
      unexpectedSince: now,
      okaySince: null,
    });
  });

  it("does not refresh an already-set unexpectedSince", () => {
    const result = classifyMember(
      hospitalStatus(nowSec + 500),
      "Okay",
      { unexpectedSince: now - 2_000, okaySince: null },
      now,
      now,
      CONFIG,
    );

    expect(result.nextTransitionState.unexpectedSince).toBe(now - 2_000);
  });

  it("is an expected exit when the timer has elapsed and DOM shows Okay", () => {
    const result = classifyMember(
      hospitalStatus(nowSec - 10),
      "Okay",
      { unexpectedSince: now - 50_000, okaySince: null },
      now,
      now,
      CONFIG,
    );

    expect(result.sortGroup).toBe(SortGroup.ExpectedOkay);
    expect(result.nextTransitionState).toEqual({
      unexpectedSince: null,
      okaySince: (nowSec - 10) * 1000,
    });
  });

  it("still flags an unexpected transition just beyond the expiry tolerance", () => {
    const result = classifyMember(
      hospitalStatus(nowSec + 3),
      "Okay",
      NO_TRANSITION,
      now,
      now,
      CONFIG,
    );

    expect(result.sortGroup).toBe(SortGroup.UnexpectedOkay);
  });

  it("is an expected exit at exactly the expiry tolerance, anchored to the scheduled expiry", () => {
    const result = classifyMember(
      hospitalStatus(nowSec + 2),
      "Okay",
      NO_TRANSITION,
      now,
      now,
      CONFIG,
    );

    expect(result.sortGroup).toBe(SortGroup.ExpectedOkay);
    expect(result.nextTransitionState).toEqual({
      unexpectedSince: null,
      okaySince: (nowSec + 2) * 1000,
    });
  });

  it("is an expected exit at exactly zero time remaining", () => {
    const result = classifyMember(
      hospitalStatus(nowSec),
      "Okay",
      NO_TRANSITION,
      now,
      now,
      CONFIG,
    );

    expect(result.sortGroup).toBe(SortGroup.ExpectedOkay);
  });

  it("applies the expiry tolerance to jail exits as well", () => {
    const result = classifyMember(
      jailStatus(nowSec + 1),
      "Okay",
      NO_TRANSITION,
      now,
      now,
      CONFIG,
    );

    expect(result.sortGroup).toBe(SortGroup.ExpectedOkay);
    expect(result.nextTransitionState).toEqual({
      unexpectedSince: null,
      okaySince: (nowSec + 1) * 1000,
    });
  });
});

describe("classifyMember — Traveling/Abroad, DOM confirms (canonicalStatus Traveling)", () => {
  const now = 1_700_000_000_000;

  it("is Abroad with no route when the description says 'In <country>'", () => {
    const result = classifyMember(
      travelingStatus("In Mexico"),
      "Traveling",
      { unexpectedSince: now - 1_000, okaySince: 123 },
      now,
      now,
      CONFIG,
    );

    expect(result.sortGroup).toBe(SortGroup.Abroad);
    expect(result.route).toBeNull();
    expect(result.nextTransitionState).toEqual({
      unexpectedSince: null,
      okaySince: null,
    });
  });

  it("is Outgoing with a route when traveling from Torn", () => {
    const result = classifyMember(
      travelingStatus("Traveling from Torn to Mexico"),
      "Traveling",
      NO_TRANSITION,
      now,
      now,
      CONFIG,
    );

    expect(result.sortGroup).toBe(SortGroup.Outgoing);
    expect(result.route).toEqual({ from: "TC", to: "MX" });
  });

  it("is Incoming with a route when traveling to Torn", () => {
    const result = classifyMember(
      travelingStatus("Traveling from Mexico to Torn"),
      "Traveling",
      NO_TRANSITION,
      now,
      now,
      CONFIG,
    );

    expect(result.sortGroup).toBe(SortGroup.Incoming);
    expect(result.route).toEqual({ from: "MX", to: "TC" });
  });

  it("falls back to generic Traveling when the description doesn't parse as a route", () => {
    const result = classifyMember(
      travelingStatus("Somewhere unparseable"),
      "Traveling",
      NO_TRANSITION,
      now,
      now,
      CONFIG,
    );

    expect(result.sortGroup).toBe(SortGroup.Traveling);
    expect(result.route).toBeNull();
  });
});

describe("classifyMember — Traveling/Abroad, DOM hasn't confirmed", () => {
  const now = 1_700_000_000_000;

  it("flags an unexpected transition (landed) when DOM shows Okay", () => {
    const result = classifyMember(
      travelingStatus("Traveling from Torn to Mexico"),
      "Okay",
      NO_TRANSITION,
      now,
      now,
      CONFIG,
    );

    expect(result.sortGroup).toBe(SortGroup.UnexpectedOkay);
    expect(result.nextTransitionState.unexpectedSince).toBe(now);
  });

  it("leaves transition state untouched on an Unknown (transient) DOM read, carrying forward ExpectedOkay", () => {
    const result = classifyMember(
      travelingStatus("Traveling from Torn to Mexico"),
      "Unknown",
      NO_TRANSITION,
      now,
      now,
      CONFIG,
    );

    expect(result.sortGroup).toBe(SortGroup.ExpectedOkay);
    expect(result.nextTransitionState.unexpectedSince).toBeNull();
  });

  it("leaves transition state untouched on an Unknown DOM read, carrying forward an existing UnexpectedOkay", () => {
    const result = classifyMember(
      travelingStatus("Traveling from Torn to Mexico"),
      "Unknown",
      { unexpectedSince: now - 3_000, okaySince: null },
      now,
      now,
      CONFIG,
    );

    expect(result.sortGroup).toBe(SortGroup.UnexpectedOkay);
    expect(result.nextTransitionState.unexpectedSince).toBe(now - 3_000);
  });
});
