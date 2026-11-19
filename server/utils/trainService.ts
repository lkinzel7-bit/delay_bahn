import type { TrainType } from "./bettingEngine";

export type NormalizedTrain = {
  externalId: string;
  trainName: string;
  trainType: TrainType;
  origin: string;
  destination: string;
  scheduledDeparture: Date;
  scheduledArrival: Date;
  actualArrival: Date | null;
  isCancelled: boolean;
};
export function mapToTrainType(trainType: string): TrainType {
  const normalized = trainType.trim().toUpperCase();

  if (
    normalized === "ICE" ||
    normalized === "IC" ||
    normalized === "RE" ||
    normalized === "RB" ||
    normalized === "S"
  ) {
    return normalized;
  } else {
    return "OTHER";
  }
}

function getMockConnections(
  origin = "Berlin Hbf",
  destination = "München Hbf",
): NormalizedTrain[] {
  const now = Date.now();
  const minute = 60_000;

  return [
    {
      // 1. Open for betting (departs in 30 mins, not yet arrived)
      externalId: "mock-ice-upcoming",
      trainName: "ICE 574",
      trainType: "ICE",
      origin,
      destination,
      scheduledDeparture: new Date(now + 30 * minute),
      scheduledArrival: new Date(now + 270 * minute),
      actualArrival: null,
      isCancelled: false,
    },
    {
      // 2. Arrived 2 minutes late -> resolves to ON_TIME
      externalId: "mock-re-ontime",
      trainName: "RE 1",
      trainType: "RE",
      origin,
      destination,
      scheduledDeparture: new Date("2026-11-17T08:00:00Z"),
      scheduledArrival: new Date("2026-11-17T10:00:00Z"),
      actualArrival: new Date("2026-11-17T10:02:00Z"),
      isCancelled: false,
    },
    {
      // 3. Arrived exactly 6 minutes late -> resolves to DELAYED (boundary test)
      externalId: "mock-ic-boundary",
      trainName: "IC 2045",
      trainType: "IC",
      origin,
      destination,
      scheduledDeparture: new Date("2026-11-17T09:00:00Z"),
      scheduledArrival: new Date("2026-11-17T12:00:00Z"),
      actualArrival: new Date("2026-11-17T12:06:00Z"),
      isCancelled: false,
    },
    {
      // 4. Arrived 18 minutes late -> resolves to DELAYED
      externalId: "mock-ice-delayed",
      trainName: "ICE 692",
      trainType: "ICE",
      origin,
      destination,
      scheduledDeparture: new Date("2026-11-17T10:00:00Z"),
      scheduledArrival: new Date("2026-11-17T14:00:00Z"),
      actualArrival: new Date("2026-11-17T14:18:00Z"),
      isCancelled: false,
    },
    {
      // 5. Cancelled train -> resolves to CANCELLED (bet REFUNDED)
      externalId: "mock-s-cancelled",
      trainName: "S 7",
      trainType: "S",
      origin,
      destination,
      scheduledDeparture: new Date("2026-11-17T11:00:00Z"),
      scheduledArrival: new Date("2026-11-17T11:45:00Z"),
      actualArrival: null,
      isCancelled: true,
    },
  ];
}

function isMockMode(): boolean {
  return process.env.USE_MOCK_TRAINS === "true";
}

//Leading _ before parameter prevents typescript giving unused paramtere warning
async function fetchLiveConnections(
  _from: string,
  _to: string,
): Promise<NormalizedTrain[]> {
  throw new Error("Live DB provider not configured");
}

async function fetchLiveConnectionById(
  _externalId: string,
): Promise<NormalizedTrain | null> {
  throw new Error("Live DB provider not configured");
}

export async function searchConnections(
  from: string,
  to: string,
): Promise<NormalizedTrain[]> {
  if (isMockMode()) {
    return getMockConnections(from || undefined, to || undefined);
  }
  try {
    return await fetchLiveConnections(from, to);
  } catch (error) {
    console.warn("Live train lookup failed, falling back to mock data:", error);
    return getMockConnections(from || undefined, to || undefined);
  }
}

function findMockConnectionById(externalId: string): NormalizedTrain | null {
  return (
    getMockConnections().find((train) => train.externalId === externalId) ??
    null
  );
}

export async function getConnectionById(
  externalId: string,
): Promise<NormalizedTrain | null> {
  if (isMockMode() || externalId.startsWith("mock-")) {
    return findMockConnectionById(externalId);
  }

  try {
    return await fetchLiveConnectionById(externalId);
  } catch (error) {
    console.warn("Live train lookup failed, falling back to mock data:", error);
    return findMockConnectionById(externalId);
  }
}
