-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "metadata" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sequence" BIGSERIAL NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dead_letter_events" (
    "id" UUID NOT NULL,
    "streamName" TEXT NOT NULL,
    "consumerGroup" TEXT NOT NULL,
    "consumerName" TEXT NOT NULL,
    "redisEntryId" TEXT NOT NULL,
    "eventId" TEXT,
    "eventType" TEXT,
    "aggregateId" TEXT,
    "payload" JSONB NOT NULL,
    "errorType" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "deliveryAttempts" INTEGER NOT NULL,
    "failedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dead_letter_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_event_type_idx" ON "events"("eventType");

-- CreateIndex
CREATE INDEX "events_occurred_at_idx" ON "events"("occurredAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "events_aggregate_version_key" ON "events"("aggregateType", "aggregateId", "version");

-- CreateIndex
CREATE INDEX "dead_letter_events_failed_at_idx" ON "dead_letter_events"("failedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "dead_letter_events_stream_entry_key" ON "dead_letter_events"("streamName", "redisEntryId");
