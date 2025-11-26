/*
  Warnings:

  - You are about to drop the column `repositoryId` on the `DataFile` table. All the data in the column will be lost.
  - Added the required column `repositoryUrl` to the `DataFile` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "DataFile" DROP CONSTRAINT "DataFile_repositoryId_fkey";

-- AlterTable
ALTER TABLE "DataFile" DROP COLUMN "repositoryId",
ADD COLUMN     "repositoryUrl" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "DataFile" ADD CONSTRAINT "DataFile_repositoryUrl_fkey" FOREIGN KEY ("repositoryUrl") REFERENCES "Repository"("url") ON DELETE CASCADE ON UPDATE CASCADE;
