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

-- CreateTable
CREATE TABLE "vector1536" (

);

-- CreateIndex
CREATE UNIQUE INDEX "Repository_url_key" ON "Repository"("url");

-- AddForeignKey
ALTER TABLE "DataFile" ADD CONSTRAINT "DataFile_repositoryUrl_fkey" FOREIGN KEY ("repositoryUrl") REFERENCES "Repository"("url") ON DELETE CASCADE ON UPDATE CASCADE;
