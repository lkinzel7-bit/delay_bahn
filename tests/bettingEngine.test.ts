import { describe, it, expect } from "vitest";
import {
  evaluateTrainOutcome,
  calculateOdds,
  settleBet,
} from "../server/utils/bettingEngine";

describe("evaluateTrainOutcome", () => {
  const scheduled = new Date("2026-11-17T12:00:00Z");

  it("returns ON_TIME for exact scheduled arrival", () => {
    const actual = new Date("2026-11-17T12:00:00Z");
    expect(evaluateTrainOutcome(scheduled, actual, false)).toBe("ON_TIME");
  });

  it("returns ON_TIME for early arrival (negative delay)", () => {
    const actual = new Date("2026-11-17T11:57:00Z");
    expect(evaluateTrainOutcome(scheduled, actual, false)).toBe("ON_TIME");
  });

  it("returns ON_TIME just below the 6-minute threshold (5m 59s)", () => {
    const actual = new Date("2026-11-17T12:05:59Z");
    expect(evaluateTrainOutcome(scheduled, actual, false)).toBe("ON_TIME");
  });

  it("returns DELAYED at the exact 6-minute boundary", () => {
    const actual = new Date("2026-11-17T12:06:00Z");
    expect(evaluateTrainOutcome(scheduled, actual, false)).toBe("DELAYED");
  });

  it("returns DELAYED for significant delays", () => {
    const actual = new Date("2026-11-17T12:42:00Z");
    expect(evaluateTrainOutcome(scheduled, actual, false)).toBe("DELAYED");
  });

  it("returns CANCELLED when cancelled with null actualArrival", () => {
    expect(evaluateTrainOutcome(scheduled, null, true)).toBe("CANCELLED");
  });

  it("returns CANCELLED even when actualArrival shows on-time", () => {
    const actual = new Date("2026-11-17T12:00:00Z");
    expect(evaluateTrainOutcome(scheduled, actual, true)).toBe("CANCELLED");
  });

  it("throws an error when actualArrival is null and train is not cancelled", () => {
    expect(() => evaluateTrainOutcome(scheduled, null, false)).toThrow();
  });
});

describe("calculateOdds", () => {
  it("returns asymmetric odds favoring DELAYED probability for long-distance trains (ICE)", () => {
    const onTimeOdds = calculateOdds("ICE", "ON_TIME");
    const delayedOdds = calculateOdds("ICE", "DELAYED");
    expect(onTimeOdds).toBeGreaterThan(1);
    expect(delayedOdds).toBeGreaterThan(1);
    expect(onTimeOdds).toBeGreaterThan(delayedOdds);
  });

  it("returns asymmetric odds favoring ON_TIME probability for regional trains (RE)", () => {
    const onTimeOdds = calculateOdds("RE", "ON_TIME");
    const delayedOdds = calculateOdds("RE", "DELAYED");
    expect(onTimeOdds).toBeGreaterThan(1);
    expect(delayedOdds).toBeGreaterThan(1);
    expect(delayedOdds).toBeGreaterThan(onTimeOdds);
  });
});

describe("settleBet", () => {
  it("settles a winning ON_TIME bet with correct payout", () => {
    expect(settleBet("ON_TIME", "ON_TIME", 10, 2.0)).toEqual({
      status: "WON",
      payout: 20,
    });
  });

  it("settles a winning DELAYED bet with correct payout", () => {
    expect(settleBet("DELAYED", "DELAYED", 10, 1.6)).toEqual({
      status: "WON",
      payout: 16,
    });
  });

  it("settles a losing bet when predicted ON_TIME but train was DELAYED", () => {
    expect(settleBet("ON_TIME", "DELAYED", 15, 2.0)).toEqual({
      status: "LOST",
      payout: 0,
    });
  });

  it("settles a losing bet when predicted DELAYED but train was ON_TIME", () => {
    expect(settleBet("DELAYED", "ON_TIME", 15, 1.6)).toEqual({
      status: "LOST",
      payout: 0,
    });
  });

  it("refunds exact stake when train is CANCELLED regardless of prediction", () => {
    expect(settleBet("ON_TIME", "CANCELLED", 25, 2.0)).toEqual({
      status: "REFUNDED",
      payout: 25,
    });
  });

  it("floors fractional payouts to integer BahnCoins", () => {
    expect(settleBet("ON_TIME", "ON_TIME", 7, 1.5)).toEqual({
      status: "WON",
      payout: 10,
    });
  });

  it("throws on zero stake", () => {
    expect(() => settleBet("ON_TIME", "ON_TIME", 0, 2.0)).toThrow();
  });

  it("throws on negative stake", () => {
    expect(() => settleBet("ON_TIME", "ON_TIME", -10, 2.0)).toThrow();
  });

  it("throws on odds less than or equal to 1", () => {
    expect(() => settleBet("ON_TIME", "ON_TIME", 10, 1.0)).toThrow();
  });
});
