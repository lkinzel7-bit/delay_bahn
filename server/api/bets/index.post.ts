import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { requireAppUser } from "../../utils/auth";
import { getConnectionById } from "../../utils/trainService";
import { calculateOdds, type BetPrediction } from "../../utils/bettingEngine";

function isValidPrediction(value: unknown): value is BetPrediction {
  return value === "ON_TIME" || value === "DELAYED";
}

export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event);
  const body = await readBody(event);

  const externalId =
    typeof body?.externalId === "string" ? body.externalId.trim() : "";
  const prediction = body?.prediction;
  const stake = Number(body?.stake);

  if (!externalId) {
    throw createError({
      statusCode: 400,
      statusMessage: "externalId is required.",
    });
  }

  if (!isValidPrediction(prediction)) {
    throw createError({
      statusCode: 400,
      statusMessage: "prediction must be 'ON_TIME' or 'DELAYED'.",
    });
  }

  if (!Number.isInteger(stake) || stake <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "stake must be a positive integer.",
    });
  }

  const train = await getConnectionById(externalId);
  if (!train) {
    throw createError({
      statusCode: 404,
      statusMessage: "Train connection not found.",
    });
  }

  if (train.isCancelled) {
    throw createError({
      statusCode: 400,
      statusMessage: "Cannot place a bet on a cancelled train.",
    });
  }

  if (new Date() >= train.scheduledDeparture) {
    throw createError({
      statusCode: 400,
      statusMessage: "Betting is closed for trains that have already departed.",
    });
  }

  const multiplier = calculateOdds(train.trainType, prediction);
  const potentialPayout = Math.floor(stake * multiplier);
  const trainStatus = train.isCancelled
    ? "CANCELLED"
    : train.actualArrival !== null
      ? "FINISHED"
      : "SCHEDULED";

  try {
    const result = await prisma.$transaction(async (tx) => {
      const freshUser = await tx.user.findUnique({
        where: { id: user.id },
        select: { balance: true },
      });

      if (!freshUser || freshUser.balance < stake) {
        throw createError({
          statusCode: 400,
          statusMessage: "Insufficient balance.",
        });
      }

      const dbTrain = await tx.trainConnection.upsert({
        where: { externalTrainId: train.externalId },
        update: {
          actualArrival: train.actualArrival,
          status: trainStatus,
        },
        create: {
          externalTrainId: train.externalId,
          trainNumber: train.trainName,
          origin: train.origin,
          destination: train.destination,
          plannedDeparture: train.scheduledDeparture,
          plannedArrival: train.scheduledArrival,
          actualArrival: train.actualArrival,
          status: trainStatus,
        },
      });

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          balance: { decrement: stake },
        },
        select: { balance: true },
      });

      const bet = await tx.bet.create({
        data: {
          userId: user.id,
          trainConnectionId: dbTrain.id,
          prediction,
          stake,
          multiplier,
          payout: potentialPayout,
          status: "PENDING",
        },
        include: {
          trainConnection: true,
        },
      });

      return { bet, balance: updatedUser.balance };
    });

    return result;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw createError({
        statusCode: 409,
        statusMessage:
          "You have already placed a bet on this train connection.",
      });
    }
    throw error;
  }
});
