import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { ApiKeyUpsertSchema } from '@devdocs/shared';
import { encryptKey, maskKey } from '../../lib/crypto';
import { db, userApiKeys } from '../../lib/db';
import { verifyApiKey } from '../../lib/apiKeys';
import { protectedProcedure, router } from '../trpc';

export const keysRouter = router({
  list: protectedProcedure.query(({ ctx }) => db.select({
    provider: userApiKeys.provider,
    maskedKey: userApiKeys.maskedKey,
    createdAt: userApiKeys.createdAt,
  }).from(userApiKeys).where(eq(userApiKeys.userId, ctx.userId))),

  upsert: protectedProcedure.input(ApiKeyUpsertSchema).mutation(async ({ ctx, input }) => {
    const verificationError = await verifyApiKey(input.provider, input.key);
    if (verificationError) throw new TRPCError({ code: 'BAD_REQUEST', message: verificationError });
    const encrypted = encryptKey(input.key);
    const maskedKey = maskKey(input.key);
    await db.insert(userApiKeys).values({
      userId: ctx.userId, provider: input.provider, keyHash: encrypted, maskedKey,
    }).onConflictDoUpdate({
      target: [userApiKeys.userId, userApiKeys.provider],
      set: { keyHash: encrypted, maskedKey, updatedAt: new Date() },
    });
    return { provider: input.provider, maskedKey };
  }),

  delete: protectedProcedure
    .input(ApiKeyUpsertSchema.pick({ provider: true }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(userApiKeys).where(and(
        eq(userApiKeys.userId, ctx.userId),
        eq(userApiKeys.provider, input.provider),
      ));
      return { success: true } as const;
    }),
});
