import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getConnectionById,
  mapToTrainType,
  searchConnections,
} from "../server/utils/trainService";

describe("trainService", () => {
  const originalEnv = process.env.USE_MOCK_TRAINS;

  beforeEach(() => {
    process.env.USE_MOCK_TRAINS = "true";
  });

  afterEach(() => {
    process.env.USE_MOCK_TRAINS = originalEnv;
    vi.restoreAllMocks();
  });

  describe("mapToTrainType", () => {
    it("maps known valid train categories directly", () => {
      expect(mapToTrainType("ICE")).toBe("ICE");
      expect(mapToTrainType("IC")).toBe("IC");
      expect(mapToTrainType("RE")).toBe("RE");
      expect(mapToTrainType("RB")).toBe("RB");
      expect(mapToTrainType("S")).toBe("S");
    });

    it("normalizes lowercase and whitespace", () => {
      expect(mapToTrainType(" ice ")).toBe("ICE");
      expect(mapToTrainType("re")).toBe("RE");
      expect(mapToTrainType("  s  ")).toBe("S");
    });

    it("maps unknown categories to OTHER", () => {
      expect(mapToTrainType("EC")).toBe("OTHER");
      expect(mapToTrainType("FLX")).toBe("OTHER");
      expect(mapToTrainType("Bus")).toBe("OTHER");
      expect(mapToTrainType("")).toBe("OTHER");
    });
  });

  describe("searchConnections", () => {
    it("returns all 5 deterministic mock connections in mock mode", async () => {
      const results = await searchConnections("Berlin Hbf", "München Hbf");

      expect(results).toHaveLength(5);
      expect(results.map((t) => t.externalId)).toEqual([
        "mock-ice-upcoming",
        "mock-re-ontime",
        "mock-ic-boundary",
        "mock-ice-delayed",
        "mock-s-cancelled",
      ]);
    });

    it("applies custom origin and destination to mock connections", async () => {
      const results = await searchConnections("Hamburg Hbf", "Köln Hbf");

      for (const train of results) {
        expect(train.origin).toBe("Hamburg Hbf");
        expect(train.destination).toBe("Köln Hbf");
      }
    });

    it("falls back to default stations when empty strings are passed", async () => {
      const results = await searchConnections("", "");

      expect(results[0]?.origin).toBe("Berlin Hbf");
      expect(results[0]?.destination).toBe("München Hbf");
    });

    it("falls back gracefully to mock connections when live mode fails", async () => {
      process.env.USE_MOCK_TRAINS = "false";
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const results = await searchConnections("Frankfurt Hbf", "Stuttgart Hbf");

      expect(warnSpy).toHaveBeenCalledOnce();
      expect(results).toHaveLength(5);
      expect(results[0]?.origin).toBe("Frankfurt Hbf");
      expect(results[0]?.destination).toBe("Stuttgart Hbf");
    });
  });

  describe("getConnectionById", () => {
    it("returns the matching mock connection by externalId", async () => {
      const delayed = await getConnectionById("mock-ice-delayed");
      const cancelled = await getConnectionById("mock-s-cancelled");

      expect(delayed).not.toBeNull();
      expect(delayed?.trainName).toBe("ICE 692");
      expect(delayed?.isCancelled).toBe(false);
      expect(delayed?.actualArrival).toEqual(new Date("2026-11-17T14:18:00Z"));

      expect(cancelled).not.toBeNull();
      expect(cancelled?.isCancelled).toBe(true);
      expect(cancelled?.actualArrival).toBeNull();
    });

    it("returns null when no connection matches the externalId", async () => {
      const result = await getConnectionById("mock-does-not-exist");

      expect(result).toBeNull();
    });

    it("resolves mock-prefixed IDs even when USE_MOCK_TRAINS is false", async () => {
      process.env.USE_MOCK_TRAINS = "false";

      const result = await getConnectionById("mock-re-ontime");

      expect(result).not.toBeNull();
      expect(result?.trainName).toBe("RE 1");
    });

    it("falls back to mock lookup and returns null for unknown non-mock IDs when live mode fails", async () => {
      process.env.USE_MOCK_TRAINS = "false";
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await getConnectionById("live-trip-999");

      expect(warnSpy).toHaveBeenCalledOnce();
      expect(result).toBeNull();
    });
  });
});
