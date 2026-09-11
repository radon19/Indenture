-- CreateTable
CREATE TABLE "Evidence" (
    "id" SERIAL NOT NULL,
    "txHash" TEXT NOT NULL,
    "chainKey" INTEGER NOT NULL,
    "protocol" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "borrower" TEXT,
    "amountRaw" TEXT,
    "blockNumber" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "totalProved" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_txHash_key" ON "Evidence"("txHash");

-- CreateIndex
CREATE INDEX "Evidence_protocol_kind_idx" ON "Evidence"("protocol", "kind");
