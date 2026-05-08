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
