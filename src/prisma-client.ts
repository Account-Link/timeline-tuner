import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const userDb = {
  async isUserActive(twitterId: string) {
    const user = await prisma.user.findUnique({
      where: { twitterId }
    });
    return user?.isActive || false;
  },

  async storeUser(twitterId: string, twitterUsername: string) {
    return prisma.user.upsert({
      where: { twitterId },
      update: { twitterUsername },
      create: { twitterId, twitterUsername }
    });
  },

  async setUserActiveStatus(twitterId: string, isActive: boolean) {
    return prisma.user.update({
      where: { twitterId },
      data: { 
        isActive,
        lastActive: isActive ? new Date() : undefined
      }
    });
  }
}; 