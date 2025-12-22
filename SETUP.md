# creation

npx sv create sveltekit

SvelteKit minimal 

Yes, TypeScript

sveltekit-adapter

node adapter

npm


# Database

```
cd sveltekit
npm install prisma --save-dev
npm install @prisma/client
npm install @prisma/adapter-pg

npx prisma init
```

## User Creation
```
-- Create user
CREATE USER edtechrag_dev WITH PASSWORD 'PASSWORT_NOGIT';

-- Create database with user as owner
CREATE DATABASE edtechrag_dev OWNER edtechrag_dev;

-- Set privileges
GRANT ALL PRIVILEGES ON DATABASE edtechrag_dev TO edtechrag_dev;
```

and local database for migrations

```
-- Create database with user as owner
CREATE DATABASE edtechrag_migrations OWNER edtechrag_dev;

-- Set privileges
GRANT ALL PRIVILEGES ON DATABASE edtechrag_migrations TO edtechrag_dev;
```

## vector v3
Create manual after prisma migreate dev: 


```

CREATE EXTENSION IF NOT EXISTS vector;

DROP TABLE "vector1536";

-- CreateTable
CREATE TABLE "vector1536" (
    "id" SERIAL NOT NULL,
    "repositoryUrl" TEXT,
    "dataFileId" INTEGER,
    "chunkNr" INTEGER,
    "content" TEXT,
    "embeddingModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "embeddedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "embeddingVector" vector(1536),

    CONSTRAINT "vector1536_pkey" PRIMARY KEY ("id")
);



----  access allow

GRANT ALL ON SCHEMA public TO edtechrag_dev;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO edtechrag_dev;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO edtechrag_dev;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO edtechrag_dev;



```


## .env 

DATABASE_URL="postgresql://edtechrag_dev:PASSWORT_NOGIT@localhost:5434/edtechrag_dev"
SHADOW_DATABASE_URL="postgresql://edtechrag_dev:PASSWORT_NOGIT@localhost:5434/edtechrag_migrations"

## pisma.config.ts
datasource: {
  url: env("DATABASE_URL"),
  shadowDatabaseUrl: env("SHADOW_DATABASE_URL")
},

## Submit database changes
```
npx prisma migrate dev --name init
npx prisma generate
```

und danach wenn alles geht:
```
npx prisma migrate status
npx prisma migrate deploy
```


## DB Sequence Reset:
SELECT * FROM "QuizQuestion_id_seq";

ALTER SEQUENCE "QuizQuestion_id_seq" RESTART WITH 40;

SELECT * FROM "Course_id_seq";

ALTER SEQUENCE "Course_id_seq" RESTART WITH 10;

SELECT * FROM "Element_id_seq";

ALTER SEQUENCE "Element_id_seq" RESTART WITH 55;

SELECT * FROM "Lesson_id_seq";

ALTER SEQUENCE "Lesson_id_seq" RESTART WITH 22;


## DB Update

docker-compose pull
docker-compose up -d


## Langchian
npm install langchain
npm install @langchain/textsplitters







---

## OLD Vector v1

```
---- https://www.prisma.io/blog/orm-6-13-0-ci-cd-workflows-and-pgvector-for-prisma-postgres

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "DataChunk"
ADD COLUMN     "embeddingVector" VECTOR(1536);
```


## DB2
```
CREATE EXTENSION IF NOT EXISTS vector;

-- Database
GRANT ALL PRIVILEGES ON DATABASE edtechrag_dev2 TO edtechrag_dev;

-- Schema
GRANT ALL PRIVILEGES ON SCHEMA public TO edtechrag_dev;

-- Tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO edtechrag_dev;

-- Sequences (BIGSERIAL needs this)
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO edtechrag_dev;

-- Functions (for completeness)
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO edtechrag_dev;

-- pgvector type visibility (CRITICAL)
GRANT USAGE ON TYPE public.vector TO edtechrag_dev;

```
