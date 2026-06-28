ALTER TABLE "Repository"
ADD COLUMN "activeSimplePage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "activeSinglePage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "activeParameterPage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "activeEmbedApi" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "embedAllowedHostRegex" TEXT;
