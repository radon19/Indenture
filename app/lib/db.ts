import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/client";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const globalForDb = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForDb.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForDb.prisma = db;
