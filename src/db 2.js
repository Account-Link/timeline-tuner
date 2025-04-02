// Using ES modules syntax
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * User database operations
 */
export const userDb = {
  /**
   * Store a user in the database
   * @param twitterId - Twitter user ID
   * @param twitterUsername - Twitter username
   */
  async storeUser(twitterId, twitterUsername) {
    try {
      return await prisma.user.upsert({
        where: { twitterId },
        update: { twitterUsername, updatedAt: new Date() },
        create: {
          twitterId,
          twitterUsername,
          isActive: false,
        },
      });
    } catch (error) {
      console.error('Error storing user:', error);
      throw error;
    }
  },

  /**
   * Check if a user is already active in another session
   * @param twitterId - Twitter user ID
   */
  async isUserActive(twitterId) {
    try {
      const user = await prisma.user.findUnique({
        where: { twitterId },
      });
      return user?.isActive || false;
    } catch (error) {
      console.error('Error checking user active status:', error);
      return false;
    }
  },

  /**
   * Set user active status
   * @param twitterId - Twitter user ID
   * @param isActive - Active status to set
   */
  async setUserActiveStatus(twitterId, isActive) {
    try {
      return await prisma.user.update({
        where: { twitterId },
        data: {
          isActive,
          lastActive: isActive ? new Date() : undefined,
        },
      });
    } catch (error) {
      console.error('Error setting user active status:', error);
      throw error;
    }
  },

  /**
   * Store user preferences
   * @param twitterId - Twitter user ID
   * @param preferences - Array of preference strings
   */
  async storeUserPreferences(twitterId, preferences) {
    try {
      // First get user
      const user = await prisma.user.findUnique({
        where: { twitterId },
      });

      if (\!user) {
        throw new Error(`User with Twitter ID ${twitterId} not found`);
      }

      // Clear existing preferences (set inactive)
      await prisma.userPreference.updateMany({
        where: { userId: user.id },
        data: { isActive: false },
      });

      // Add new preferences
      const createOperations = preferences.map(preference => 
        prisma.userPreference.create({
          data: {
            userId: user.id,
            preference: preference.trim(),
            isActive: true,
          },
        })
      );

      return await prisma.(createOperations);
    } catch (error) {
      console.error('Error storing user preferences:', error);
      throw error;
    }
  },

  /**
   * Get user preferences
   * @param twitterId - Twitter user ID
   */
  async getUserPreferences(twitterId) {
    try {
      const user = await prisma.user.findUnique({
        where: { twitterId },
        include: {
          preferences: {
            where: { isActive: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (\!user) return [];
      
      return user.preferences.map(p => p.preference);
    } catch (error) {
      console.error('Error getting user preferences:', error);
      return [];
    }
  }
};

export default prisma;
