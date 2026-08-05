-- The search embed (static/embed/search) is switched on separately from the chat
-- embed: a site may want the search without the chatbot, or the other way round.
-- The origin gate stays shared - embedAllowedHostRegex guards both.
ALTER TABLE "Repository"
ADD COLUMN "activeSearchApi" BOOLEAN NOT NULL DEFAULT false;
