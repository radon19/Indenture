// Shared Prisma client over the pg pooler. Singleton per process (dev: cached
// on globalThis so hot-reloads don't exhaust connections).
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/client";

// Takes DATABASE_URL, opens the pooled adapter. Missing env fails fast here.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const globalForDb = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForDb.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForDb.prisma = db;
