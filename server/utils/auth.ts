import type { H3Event } from "h3";
import { serverSupabaseUser } from "#supabase/server";
import type { User } from "@prisma/client";
import { prisma } from "./prisma";

function extractUsername(
  userId: string,
  supabaseUser: {
    email?: string;
    user_metadata?: Record<string, unknown>;
  },
): string {
  const metaUsername = supabaseUser.user_metadata?.username;
  if (typeof metaUsername === "string" && metaUsername.trim().length > 0) {
    return metaUsername.trim();
  }

  if (supabaseUser.email) {
    return supabaseUser.email.split("@")[0] ?? `user_${userId.slice(0, 8)}`;
  }

  return `user_${userId.slice(0, 8)}`;
}

export async function requireAppUser(event: H3Event): Promise<User> {
  const supabaseUser = await serverSupabaseUser(event);
  const userId = supabaseUser?.sub;

  if (!supabaseUser || !userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized: Valid user session required.",
    });
  }

  const username = extractUsername(userId, supabaseUser);
  const email =
    supabaseUser.email ?? `${username.toLowerCase()}@delaybahn.local`;

  const appUser = await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email,
      username,
      passwordHash: "supabase_managed",
    },
  });

  return appUser;
}
