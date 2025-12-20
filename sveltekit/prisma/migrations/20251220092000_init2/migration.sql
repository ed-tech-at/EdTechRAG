-- CreateTable
CREATE TABLE "Repository" (
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "updateConfig" JSONB,
    "LLM_API" JSONB,
    "ragConfig" JSONB
);

-- CreateTable
CREATE TABLE "DataFile" (
    "id" SERIAL NOT NULL,
    "repositoryUrl" TEXT NOT NULL,
    "remoteUrl" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "chunkedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),

    CONSTRAINT "DataFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataChunk" (
    "id" SERIAL NOT NULL,
    "chunkNr" INTEGER,
    "content" TEXT,
    "dataFileId" INTEGER NOT NULL,
    "embeddingModel" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "embeddedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),

    CONSTRAINT "DataChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatLog" (
    "id" SERIAL NOT NULL,
    "repositoryUrl" TEXT,
    "endpoint" TEXT,
    "question" TEXT,
    "context" TEXT,
    "answer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Repository_url_key" ON "Repository"("url");

-- AddForeignKey
ALTER TABLE "DataFile" ADD CONSTRAINT "DataFile_repositoryUrl_fkey" FOREIGN KEY ("repositoryUrl") REFERENCES "Repository"("url") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataChunk" ADD CONSTRAINT "DataChunk_dataFileId_fkey" FOREIGN KEY ("dataFileId") REFERENCES "DataFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
