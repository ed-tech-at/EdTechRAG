/*
  Warnings:

  - The primary key for the `ChatLog` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `ChatLog` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `DataChunk` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `lastSeen` on the `DataChunk` table. All the data in the column will be lost.
  - The `id` column on the `DataChunk` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `DataFile` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `lastSeen` on the `DataFile` table. All the data in the column will be lost.
  - The `id` column on the `DataFile` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `dataFileId` on the `DataChunk` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "DataChunk" DROP CONSTRAINT "DataChunk_dataFileId_fkey";

-- AlterTable
ALTER TABLE "ChatLog" DROP CONSTRAINT "ChatLog_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "ChatLog_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "DataChunk" DROP CONSTRAINT "DataChunk_pkey",
DROP COLUMN "lastSeen",
ADD COLUMN     "embeddedAt" TIMESTAMP(3),
ADD COLUMN     "invalidatedAt" TIMESTAMP(3),
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "dataFileId",
ADD COLUMN     "dataFileId" INTEGER NOT NULL,
ADD CONSTRAINT "DataChunk_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "DataFile" DROP CONSTRAINT "DataFile_pkey",
DROP COLUMN "lastSeen",
ADD COLUMN     "chunkedAt" TIMESTAMP(3),
ADD COLUMN     "invalidatedAt" TIMESTAMP(3),
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "DataFile_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Repository" ADD COLUMN     "ragConfig" JSONB;

-- AddForeignKey
ALTER TABLE "DataChunk" ADD CONSTRAINT "DataChunk_dataFileId_fkey" FOREIGN KEY ("dataFileId") REFERENCES "DataFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
