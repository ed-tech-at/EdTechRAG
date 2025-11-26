-- CreateTable
CREATE TABLE "Repository" (
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "updateConfig" JSONB
);

-- CreateTable
CREATE TABLE "DataFile" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "remoteUrl" TEXT,
    "meta" JSONB,
    "lastSeen" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataChunk" (
    "id" TEXT NOT NULL,
    "dataFileId" TEXT NOT NULL,
    "chunkNr" INTEGER,
    "content" TEXT,
    "embeddingModel" TEXT,
    "lastSeen" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Repository_url_key" ON "Repository"("url");

-- AddForeignKey
ALTER TABLE "DataFile" ADD CONSTRAINT "DataFile_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("url") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataChunk" ADD CONSTRAINT "DataChunk_dataFileId_fkey" FOREIGN KEY ("dataFileId") REFERENCES "DataFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
