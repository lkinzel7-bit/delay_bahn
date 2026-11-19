import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { Prisma } from "@prisma/client";

// 1. Stub Nitro / H3 auto-imported globals before importing route handlers
// 1. Stub Nitro / H3 auto-imported globals BEFORE static imports evaluate
vi.hoisted(() => {
  Object.assign(globalThis, {
    defineEventHandler: (handler: unknown) => handler,
    readBody: async (event: { body?: unknown }) => event.body,
    createError: (input: { statusCode: number; statusMessage: string }) => {
      const err = new Error(input.statusMessage) as Error & {
        statusCode: number;
        statusMessage: string;
      };
      err.statusCode = input.statusCode;
      err.statusMessage = input.statusMessage;
      return err;
    },
  });
});

// 2. Mock Prisma, Auth, and TrainService
const mockTx = {
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  trainConnection: {
    upsert: vi.fn(),
    update: vi.fn(),
  },
  bet: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("../server/utils/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) =>
      cb(mockTx),
    ),
    bet: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../server/utils/auth", () => ({
  requireAppUser: vi.fn(),
}));

vi.mock("../server/utils/trainService", () => ({
  getConnectionById: vi.fn(),
}));

// Import handlers and mocked modules after mocks are registered
import placeBetHandler from "../server/api/bets/index.post";
import settleBetsHandler from "../server/api/bets/settle.post";
import { prisma } from "../server/utils/prisma";
import { requireAppUser } from "../server/utils/auth";
import { getConnectionById } from "../server/utils/trainService";

const mockUser = {
  id: "user_123",
  email: "max@delaybahn.local",
  username: "max",
  passwordHash: "supabase_managed",
  balance: 100,
  createdAt: new Date("2026-11-01T10:00:00Z"),
};

const futureDeparture = new Date(Date.now() + 60 * 60 * 1000); // +1 hour
const futureArrival = new Date(Date.now() + 3 * 60 * 60 * 1000); // +3 hours

const sampleTrain = {
  externalId: "db-ice-721",
  trainName: "ICE 721",
  trainType: "ICE" as const,
  origin: "Berlin Hbf",
  destination: "München Hbf",
  scheduledDeparture: futureDeparture,
  scheduledArrival: futureArrival,
  actualArrival: null,
  isCancelled: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAppUser).mockResolvedValue(mockUser);
});

describe("POST /api/bets", () => {
  it("places a bet atomically, deducts balance, and locks ICE multiplier", async () => {
    vi.mocked(getConnectionById).mockResolvedValue(sampleTrain);
    mockTx.user.findUnique.mockResolvedValue({ balance: 100 });
    mockTx.trainConnection.upsert.mockResolvedValue({
      id: "tc_1",
      externalTrainId: "db-ice-721",
      trainNumber: "ICE 721",
      origin: "Berlin Hbf",
      destination: "München Hbf",
      plannedDeparture: futureDeparture,
      plannedArrival: futureArrival,
      actualArrival: null,
      status: "SCHEDULED",
      updatedAt: new Date(),
    });
    mockTx.user.update.mockResolvedValue({ balance: 75 });
    mockTx.bet.create.mockImplementation(async ({ data }) => ({
      id: "bet_1",
      ...data,
      createdAt: new Date(),
    }));

    const event = {
      body: {
        externalId: "db-ice-721",
        prediction: "DELAYED",
        stake: 25,
      },
    } as never;

    const response = await placeBetHandler(event);

    // ICE + DELAYED multiplier is 1.6 -> floor(25 * 1.6) = 40
    expect(mockTx.user.update).toHaveBeenCalledWith({
      where: { id: "user_123" },
      data: { balance: { decrement: 25 } },
      select: { balance: true },
    });

    expect(mockTx.bet.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user_123",
          trainConnectionId: "tc_1",
          prediction: "DELAYED",
          stake: 25,
          multiplier: 1.6,
          payout: 40,
          status: "PENDING",
        }),
      }),
    );

    expect(response.balance).toBe(75);
    expect(response.bet.status).toBe("PENDING");
  });

  it("rejects bets when user balance is insufficient", async () => {
    vi.mocked(getConnectionById).mockResolvedValue(sampleTrain);
    mockTx.user.findUnique.mockResolvedValue({ balance: 10 });

    const event = {
      body: {
        externalId: "db-ice-721",
        prediction: "ON_TIME",
        stake: 50,
      },
    } as never;

    await expect(placeBetHandler(event)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "Insufficient balance.",
    });

    expect(mockTx.bet.create).not.toHaveBeenCalled();
  });

  it("rejects bets after scheduledDeparture cutoff", async () => {
    vi.mocked(getConnectionById).mockResolvedValue({
      ...sampleTrain,
      scheduledDeparture: new Date(Date.now() - 5 * 60 * 1000), // departed 5m ago
    });

    const event = {
      body: {
        externalId: "db-ice-721",
        prediction: "DELAYED",
        stake: 10,
      },
    } as never;

    await expect(placeBetHandler(event)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "Betting is closed for trains that have already departed.",
    });
  });

  it("rejects bets on cancelled trains", async () => {
    vi.mocked(getConnectionById).mockResolvedValue({
      ...sampleTrain,
      isCancelled: true,
    });

    const event = {
      body: {
        externalId: "db-ice-721",
        prediction: "DELAYED",
        stake: 10,
      },
    } as never;

    await expect(placeBetHandler(event)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "Cannot place a bet on a cancelled train.",
    });
  });

  it("returns 409 Conflict on duplicate bet for the same user & train (P2002)", async () => {
    vi.mocked(getConnectionById).mockResolvedValue(sampleTrain);
    mockTx.user.findUnique.mockResolvedValue({ balance: 100 });
    mockTx.trainConnection.upsert.mockResolvedValue({ id: "tc_1" });
    mockTx.user.update.mockResolvedValue({ balance: 90 });

    const p2002Error = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "7.0.0" },
    );
    mockTx.bet.create.mockRejectedValue(p2002Error);

    const event = {
      body: {
        externalId: "db-ice-721",
        prediction: "ON_TIME",
        stake: 10,
      },
    } as never;

    await expect(placeBetHandler(event)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe("POST /api/bets/settle", () => {
  const scheduledArrival = new Date("2026-11-17T14:00:00Z");

  const pendingBet = {
    id: "bet_1",
    userId: "user_123",
    trainConnectionId: "tc_1",
    prediction: "DELAYED",
    stake: 25,
    multiplier: 1.6,
    status: "PENDING",
    payout: 40,
    createdAt: new Date("2026-11-17T10:00:00Z"),
    trainConnection: {
      id: "tc_1",
      externalTrainId: "db-ice-721",
      trainNumber: "ICE 721",
      origin: "Berlin Hbf",
      destination: "München Hbf",
      plannedDeparture: new Date("2026-11-17T11:00:00Z"),
      plannedArrival: scheduledArrival,
      actualArrival: null,
      status: "SCHEDULED",
      updatedAt: new Date(),
    },
  };

  it("settles a WON bet when delay >= 6 minutes and credits payout to user balance", async () => {
    vi.mocked(prisma.bet.findMany).mockResolvedValue([pendingBet] as never);
    vi.mocked(getConnectionById).mockResolvedValue({
      ...sampleTrain,
      scheduledArrival,
      // 8 minutes late -> DELAYED (>= 6 min threshold)
      actualArrival: new Date("2026-11-17T14:08:00Z"),
      isCancelled: false,
    });

    mockTx.bet.findUnique.mockResolvedValue({ status: "PENDING" });
    mockTx.bet.update.mockResolvedValue({
      ...pendingBet,
      status: "WON",
      payout: 40,
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      balance: 115,
    } as never);

    const response = await settleBetsHandler({ body: {} } as never);

    expect(mockTx.trainConnection.update).toHaveBeenCalledWith({
      where: { id: "tc_1" },
      data: {
        actualArrival: new Date("2026-11-17T14:08:00Z"),
        status: "FINISHED",
      },
    });

    expect(mockTx.bet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "bet_1" },
        data: { status: "WON", payout: 40 },
      }),
    );

    expect(mockTx.user.update).toHaveBeenCalledWith({
      where: { id: "user_123" },
      data: { balance: { increment: 40 } },
    });

    expect(response.settledCount).toBe(1);
    expect(response.balance).toBe(115);
  });

  it("settles a LOST bet with 0 payout when train arrives < 6 minutes late", async () => {
    vi.mocked(prisma.bet.findMany).mockResolvedValue([pendingBet] as never);
    vi.mocked(getConnectionById).mockResolvedValue({
      ...sampleTrain,
      scheduledArrival,
      // 4 minutes late -> ON_TIME (< 6 min threshold)
      actualArrival: new Date("2026-11-17T14:04:00Z"),
      isCancelled: false,
    });

    mockTx.bet.findUnique.mockResolvedValue({ status: "PENDING" });
    mockTx.bet.update.mockResolvedValue({
      ...pendingBet,
      status: "LOST",
      payout: 0,
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      balance: 75,
    } as never);

    const response = await settleBetsHandler({ body: {} } as never);

    expect(mockTx.bet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "LOST", payout: 0 },
      }),
    );
    expect(mockTx.user.update).not.toHaveBeenCalled();
    expect(response.settledCount).toBe(1);
  });

  it("refunds stake and marks train CANCELLED when train is cancelled", async () => {
    vi.mocked(prisma.bet.findMany).mockResolvedValue([pendingBet] as never);
    vi.mocked(getConnectionById).mockResolvedValue({
      ...sampleTrain,
      scheduledArrival,
      actualArrival: null,
      isCancelled: true,
    });

    mockTx.bet.findUnique.mockResolvedValue({ status: "PENDING" });
    mockTx.bet.update.mockResolvedValue({
      ...pendingBet,
      status: "REFUNDED",
      payout: 25,
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      balance: 100,
    } as never);

    const response = await settleBetsHandler({ body: {} } as never);

    expect(mockTx.trainConnection.update).toHaveBeenCalledWith({
      where: { id: "tc_1" },
      data: {
        actualArrival: null,
        status: "CANCELLED",
      },
    });

    expect(mockTx.user.update).toHaveBeenCalledWith({
      where: { id: "user_123" },
      data: { balance: { increment: 25 } },
    });
    expect(response.settledCount).toBe(1);
  });

  it("skips trains that are still in transit (actualArrival is null and not cancelled)", async () => {
    vi.mocked(prisma.bet.findMany).mockResolvedValue([pendingBet] as never);
    vi.mocked(getConnectionById).mockResolvedValue({
      ...sampleTrain,
      scheduledArrival,
      actualArrival: null,
      isCancelled: false,
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      balance: 75,
    } as never);

    const response = await settleBetsHandler({ body: {} } as never);

    expect(response.settledCount).toBe(0);
    expect(mockTx.bet.update).not.toHaveBeenCalled();
  });
});
