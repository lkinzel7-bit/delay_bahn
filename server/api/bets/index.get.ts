import { prisma } from "../../utils/prisma";
import { requireAppUser } from "../../utils/auth";

export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event);

  const bets = await prisma.bet.findMany({
    where: { userId: user.id },
    include: { trainConnection: true },
    orderBy: { createdAt: "desc" },
  });

  return {
    balance: user.balance,
    bets,
  };
});
