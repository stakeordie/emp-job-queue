import { PrismaClient } from '@prisma/client';

// Global is used here to maintain a cache of the Prisma Client across hot reloads in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL + '?application_name=Monitor-Forensics&connection_limit=50&pool_timeout=20',
      },
    },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
