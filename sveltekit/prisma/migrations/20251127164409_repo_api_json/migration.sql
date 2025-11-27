-- AlterTable
ALTER TABLE "Repository" ADD COLUMN     "LLM_API" JSONB;

-- CreateTable
CREATE TABLE "ChatLog" (
    "id" TEXT NOT NULL,
    "question" TEXT,
    "context" TEXT,
    "answer" TEXT,
    "repositoryUrl" TEXT,
    "endpoint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatLog_pkey" PRIMARY KEY ("id")
);
