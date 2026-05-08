-- AlterTable
ALTER TABLE "Repository" ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "Repository_pkey" PRIMARY KEY ("id");
