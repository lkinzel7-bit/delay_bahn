import { prisma } from "../../utils/prisma";
import { requireAppUser } from "../../utils/auth";
import { getConnectionById } from "../../utils/trainService";
import {
  evaluateTrainOutcome,
  settleBet,
  type BetPrediction,
} from "../../utils/bettingEngine";

export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event);
  const body = await readBody(event).catch(() => ({}));
  const targetBetId =
    typeof body?.betId === "string" ? body.betId.trim() : undefined;

  const pendingBets = await prisma.bet.findMany({
    where: {
      userId: user.id,
      status: "PENDING",
      ...(targetBetId ? { id: targetBetId } : {}),
    },
    include: { trainConnection: true },
  });

  const settledBets = [];

  for (const bet of pendingBets) {
    const latestTrain = await getConnectionById(
      bet.trainConnection.externalTrainId,
    );
    if (!latestTrain) continue;

    if (!latestTrain.isCancelled && latestTrain.actualArrival === null) {
      continue;
    }

    const outcome = evaluateTrainOutcome(
      latestTrain.scheduledArrival,
      latestTrain.actualArrival,
      latestTrain.isCancelled,
    );

    const resolution = settleBet(
      bet.prediction as BetPrediction,
      outcome,
      bet.stake,
      bet.multiplier,
    );

    const updated = await prisma.$transaction(async (tx) => {
      const currentBet = await tx.bet.findUnique({
        where: { id: bet.id },
        select: { status: true },
      });

      if (!currentBet || currentBet.status !== "PENDING") {
        return null;
      }

      await tx.trainConnection.update({
        where: { id: bet.trainConnectionId },
        data: {
          actualArrival: latestTrain.actualArrival,
          status: latestTrain.isCancelled ? "CANCELLED" : "FINISHED",
        },
      });

      const settledBet = await tx.bet.update({
        where: { id: bet.id },
        data: {
          status: resolution.status,
          payout: resolution.payout,
        },
        include: { trainConnection: true },
      });

      if (resolution.payout > 0) {
        await tx.user.update({
          where: { id: user.id },
          data: {
            balance: { increment: resolution.payout },
          },
        });
      }

      return settledBet;
    });

    if (updated) {
      settledBets.push(updated);
    }
  }

  const freshUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { balance: true },
  });

  return {
    settledCount: settledBets.length,
    settledBets,
    balance: freshUser?.balance ?? user.balance,
  };
});
