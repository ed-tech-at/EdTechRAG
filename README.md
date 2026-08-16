# EdTechRAG

Software created by [Ed-Tech Research Community Graz](https://ed-tech.at)

Licence for this Software is [MIT](./LICENSE)

Licence for the Content is [CC BY 4.0 International](https://creativecommons.org/licenses/by/4.0/) Lehr- und Lerntechnologien, TU Graz

## Distribution & Self-Hosting

Self-hosting, modification, and redistribution of this project are permitted under the applicable licenses; however, when self-hosting, all TU Graz-specific references, including the TU Graz logo and institutional imprint, must be removed unless explicit permission has been granted. The original copyright notice must be retained: the software is licensed under the MIT License and requires inclusion of the original copyright and license text, and the content is licensed under CC BY 4.0 International and requires appropriate attribution to Lehr- und Lerntechnologien, TU Graz, including a link to the license and an indication of changes.

## Local Development Startguide

For this startguide, you need [Docker](https://www.docker.com/get-started/) and [Node.js](https://nodejs.org/en/download).

## Setup Local PostgreSQL Database

An example PostgreSQL server with pgvector is available in [docker/pgvector/docker-compose.yml](./docker/pgvector/docker-compose.yml).

Instructions:

1. Start PostgreSQL server with Docker
   ```bash
   cd docker/pgvector
   docker compose up -d
   cd ../..
   ```

2. Test if `.env` is available, if not copy `.env.example` to `.env`
   ```bash
   cd sveltekit
   [ -f .env ] && echo ".env available" || cp .env.example .env
   cd ..
   ```

3. Update node modules and generate Prisma client
   ```bash
   cd sveltekit
   npm ci
   npx prisma generate
   cd ..
   ```

4. Apply database migrations
   ```bash
   cd sveltekit
   npx prisma migrate dev
   cd ..
   ```

5. Optional: Display simple database editor with Prisma Studio, open http://localhost:5555
   ```bash
   cd sveltekit
   npx prisma studio
   cd ..
   ```

6. Optional: Display advanced database editor with pgAdmin, open http://localhost:8080

## Database User Creation

```sql
-- Create user
CREATE USER edtechrag_dev WITH PASSWORD 'PASSWORT_NOGIT';

-- Create database with user as owner
CREATE DATABASE edtechrag_dev OWNER edtechrag_dev;

-- Set privileges
GRANT ALL PRIVILEGES ON DATABASE edtechrag_dev TO edtechrag_dev;
```

and local database for migrations

```sql
-- Create database with user as owner
CREATE DATABASE edtechrag_migrations OWNER edtechrag_dev;

-- Set privileges
GRANT ALL PRIVILEGES ON DATABASE edtechrag_migrations TO edtechrag_dev;
```

## Database Vector Schema

Create manual after prisma migrate dev:

```sql
-- Choose a schema name (change if you want)
CREATE SCHEMA IF NOT EXISTS rag_vectors;

-- Allow your role to use (and optionally create objects in) this schema
GRANT USAGE ON SCHEMA rag_vectors TO edtechrag_dev;
GRANT CREATE ON SCHEMA rag_vectors TO edtechrag_dev;

-- (Optional but recommended) Install pgvector into that schema
-- This may require superuser/DB owner privileges.
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

## Search Index (optional, per server)

Only needed on servers that actually serve the **search embed**
(`static/embed/search`). Deliberately **not** a Prisma migration: `prisma migrate
deploy` runs on every container start, and the index would then be built on every
installation, including those that only run the chatbot. Run it by hand where the
search is used.

The search works without it — just slowly. Measured on a repository with 19 349
chunks:

| | one query |
| --- | --- |
| without the index | **2094 ms** (sequential scan, `to_tsvector` per row) |
| with the index | **3.4 ms** (bitmap index scan) |

```sql
-- Full-text index for the database-only search (src/lib/server/textSearch.ts).
--
-- THE EXPRESSION MUST STAY CHARACTER-FOR-CHARACTER the one in findRepositoryText.
-- Postgres only uses an expression index when the query repeats the expression
-- exactly; a difference as small as dropping the coalesce() makes it fall back to a
-- scan - silently, and with the same results, so nothing looks broken.
--
-- 'simple' and not 'german': measured on the real TELucation corpus, the German
-- stemmer reduced "Noten" to the stem "not" and matched 111 of 131 documents.
-- 'simple' plus prefix matching found 5 - and still finds "Notenexport" for
-- "noten", which the stemmer does not. The configuration is part of the expression,
-- so this index serves that one choice; another configuration needs another index.
--
-- GIN and not GiST: GIN is the slower one to build and the faster one to search,
-- and this table is written by the ingest job and read by every visitor.
--
-- CONCURRENTLY, because by hand there is no transaction in the way: the build takes
-- longer but does not block the ingest pipeline. Inside a Prisma migration it would
-- not be allowed at all - one more reason this lives here and not there.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "vector1536_content_fts_idx"
  ON "rag_vectors"."vector1536"
  USING GIN (to_tsvector('simple', coalesce("content", '')));
```

Check that it exists and that the planner uses it:

```sql
\di rag_vectors.vector1536_content_fts_idx

EXPLAIN ANALYZE
SELECT count(*) FROM rag_vectors.vector1536
WHERE "repositoryUrl" = '<your-repo>' AND "invalidatedAt" IS NULL
  AND to_tsvector('simple', coalesce("content", '')) @@ to_tsquery('simple', 'test:*');
```

`Bitmap Index Scan on vector1536_content_fts_idx` means it works. `Seq Scan` means
the expression does not match the index — compare it against `findRepositoryText`
character by character.

To remove it again:

```sql
DROP INDEX CONCURRENTLY IF EXISTS "rag_vectors"."vector1536_content_fts_idx";
```

## Run Dev Environment

After the database has started, the local dev environment with hot reloading can be started. Changes in the code are automatically shown locally.

Instructions:

1. Update node modules if not already done in database setup
   ```bash
   cd sveltekit
   npm ci
   cd ..
   ```

2. Run dev environment
   ```bash
   cd sveltekit
   npm run dev
   cd ..
   ```

Then open http://localhost:5173/.

## GitHub Webhook Bridge

The optional GitHub webhook bridge is documented in [Github2EdTechRAG/README.md](./Github2EdTechRAG/README.md).

## Additional Setup Notes

Additional database setup and pgvector notes are available in [SETUP.md](./SETUP.md).
