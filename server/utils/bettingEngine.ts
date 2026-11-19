export type BetPrediction = "ON_TIME" | "DELAYED";
export type TrainOutcome = "ON_TIME" | "DELAYED" | "CANCELLED";
export type BetResolution = "WON" | "LOST" | "REFUNDED";
export const PUNCTUALITY_THRESHOLD_MINUTES = 6;
export type TrainType = "ICE" | "IC" | "RE" | "S" | "RB" | "OTHER";

const ODDS_TABLE: Record<TrainType, Record<BetPrediction, number>> = {
  ICE: { ON_TIME: 2.1, DELAYED: 1.6 },
  IC: { ON_TIME: 2.1, DELAYED: 1.6 },
  RE: { ON_TIME: 1.4, DELAYED: 2.4 },
  RB: { ON_TIME: 1.4, DELAYED: 2.4 },
  S: { ON_TIME: 1.4, DELAYED: 2.4 },
  OTHER: { ON_TIME: 1.7, DELAYED: 1.9 },
};

export function evaluateTrainOutcome(
  scheduledArrival: Date,
  actualArrival: Date | null,
  isCancelled: boolean,
): TrainOutcome {
  if (isCancelled) {
    return "CANCELLED";
  } else if (actualArrival === null) {
    throw new Error("actualArrival is null and train is not cancelled");
  }

  const delayMinutes =
    (actualArrival.getTime() - scheduledArrival.getTime()) / 60_000;

  if (delayMinutes < PUNCTUALITY_THRESHOLD_MINUTES) {
    return "ON_TIME";
  } else {
    return "DELAYED";
  }
}

export function calculateOdds(
  trainType: TrainType,
  predictionType: BetPrediction,
): number {
  const trainOdds = ODDS_TABLE[trainType];
  if (!trainOdds) {
    throw new Error(`Unsupported train type: ${trainType}`);
  }
  return trainOdds[predictionType];
}

export function settleBet(
  prediction: BetPrediction,
  outcome: TrainOutcome,
  stake: number,
  lockedOdds: number,
): { status: BetResolution; payout: number } {
  if (stake <= 0) {
    throw new Error("Stake must be greater than zero");
  }
  if (lockedOdds <= 1) {
    throw new Error("Odds must be greater than 1");
  }

  if (outcome === "CANCELLED") {
    return { status: "REFUNDED", payout: stake };
  } else if (prediction === outcome) {
    return { status: "WON", payout: Math.floor(stake * lockedOdds) };
  } else {
    return { status: "LOST", payout: 0 };
  }
}
