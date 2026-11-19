import { searchConnections } from "../../utils/trainService";
import { calculateOdds } from "../../utils/bettingEngine";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const from = typeof query.from === "string" ? query.from.trim() : "";
  const to = typeof query.to === "string" ? query.to.trim() : "";

  if (!from || !to) {
    throw createError({
      statusCode: 400,
      statusMessage: "Both 'from' and 'to' query parameters are required.",
    });
  }

  const connections = await searchConnections(from, to);

  return connections.map((train) => ({
    ...train,
    odds: {
      ON_TIME: calculateOdds(train.trainType, "ON_TIME"),
      DELAYED: calculateOdds(train.trainType, "DELAYED"),
    },
  }));
});
