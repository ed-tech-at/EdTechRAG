-- The /webview full-page chat gets its own switch, like every other public page:
-- a repository configured before this page existed must not become publicly
-- reachable because the code was updated.
ALTER TABLE "Repository"
ADD COLUMN "activeWebviewPage" BOOLEAN NOT NULL DEFAULT false;
