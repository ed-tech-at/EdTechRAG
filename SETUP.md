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

## vector v4

Create manual after prisma migreate dev: 

```

-- Choose a schema name (change if you want)
CREATE SCHEMA IF NOT EXISTS rag_vectors;

-- Allow your role to use (and optionally create objects in) this schema
GRANT USAGE ON SCHEMA rag_vectors TO edtechrag_dev;
GRANT CREATE ON SCHEMA rag_vectors TO edtechrag_dev;

-- (Optional but recommended) Install pgvector into that schema
-- ⚠️ This may require superuser/DB owner privileges.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA rag_vectors;

-- Drop and recreate the table in the NEW schema
--- DROP TABLE IF EXISTS rag_vectors.vector1536;

CREATE TABLE rag_vectors.vector1536 (
    "id"              SERIAL PRIMARY KEY,
    "repositoryUrl"   TEXT,
    "dataFileId"      INTEGER,
    "chunkNr"         INTEGER,
    "content"         TEXT,
    "embeddingModel"  TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "embeddedAt"      TIMESTAMP(3),
    "invalidatedAt"   TIMESTAMP(3),
    "embeddingVector" "rag_vectors".vector(1536)   -- if extension is in rag_vectors
    -- If extension is in public instead, use: public.vector(1536)
);

-- Grants on existing objects
GRANT ALL PRIVILEGES ON TABLE rag_vectors.vector1536 TO edtechrag_dev;

-- Also grant on sequences in this schema (needed for SERIAL inserts)
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA rag_vectors TO edtechrag_dev;

-- Make future tables/sequences in this schema accessible too
ALTER DEFAULT PRIVILEGES IN SCHEMA rag_vectors
  GRANT ALL PRIVILEGES ON TABLES TO edtechrag_dev;

ALTER DEFAULT PRIVILEGES IN SCHEMA rag_vectors
  GRANT ALL PRIVILEGES ON SEQUENCES TO edtechrag_dev;

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


# Deployment

mkdir edtechrag
cd edtechrag
git clone git@github.com:ed-tech-at/EdTechRAG.git
cp -r EdTechRAG/docker/* .
cp -r EdTechRAG/Github2EdTechRAG .

cd pgvector
docker network create pgvector_net
nano docker-compose.yml
chmod -R 777 pgadmin_data/
docker compose up -d

cd ..



cd Github2EdTechRAG/
cp .env.example .env
nano .env
nano docker-compose.yml
chmod -R 777 log/
chmod -R 777 ssh/
chmod -R 777 repos/
docker compose build
docker compose up -d


cd EdTechRAG/sveltekit/
cp .env.example .env
nano .env
cd ../../
docker compose build
docker compose up -d



