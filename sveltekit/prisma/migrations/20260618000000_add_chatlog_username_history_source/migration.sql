-- AlterTable
ALTER TABLE "ChatLog" ADD COLUMN "username" TEXT,
                      ADD COLUMN "history"  JSONB,
                      ADD COLUMN "source"   TEXT;
