import type { PageServerLoad } from './$types';
import prisma from '$lib/server/db';
import { requireUserManager } from '$lib/server/jwt';

const RANGE_DAYS = [7, 30, 90] as const;
export type RangeDays = (typeof RANGE_DAYS)[number];
const LIST_SIZE = 100;

export type UsageRow = {
	id: number;
	repositoryUrl: string;
	endpoint: string | null;
	username: string | null;
	source: string | null;
	question: string | null;
	answerPreview: string | null;
	hasContext: boolean;
	historyLength: number;
	createdAt: Date;
};

export type RepoSummary = {
	repositoryUrl: string;
	name: string | null;
	inRange: number;
	total: number;
	users: number;
	lastUsed: Date | null;
};

export type HourBucket = {
	hour: Date;
	repositoryUrl: string;
	count: number;
};

/**
 * Manager-only overview of chatbot usage: the 100 most recent ChatLog rows for
 * repositories the session may see, plus per-hour counts for the chosen range so
 * the client can bucket them into local days.
 */
export const load: PageServerLoad = async ({ cookies, url }) => {
	const session = await requireUserManager(cookies, url);
	const requestedDays = Number(url.searchParams.get('days'));
	const days: RangeDays = RANGE_DAYS.includes(requestedDays as RangeDays)
		? (requestedDays as RangeDays)
		: 30;

	const allowRegex = session.allow_regex;
	if (!allowRegex) {
		return { days, rangeDays: RANGE_DAYS, items: [], buckets: [], repositories: [] };
	}

	const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

	const [items, buckets, summaryRows, repos] = await Promise.all([
		prisma.$queryRaw<UsageRow[]>`
			SELECT "id", "repositoryUrl", "endpoint", "username", "source", "question",
			       LEFT("answer", 240) AS "answerPreview",
			       ("context" IS NOT NULL AND "context" <> '') AS "hasContext",
			       CASE WHEN jsonb_typeof("history"::jsonb) = 'array'
			            THEN jsonb_array_length("history"::jsonb) ELSE 0 END AS "historyLength",
			       "createdAt"
			FROM "ChatLog"
			WHERE "repositoryUrl" IS NOT NULL
			  AND "repositoryUrl" ~ ${allowRegex}
			ORDER BY "createdAt" DESC, "id" DESC
			LIMIT ${LIST_SIZE}
		`,
		prisma.$queryRaw<HourBucket[]>`
			SELECT date_trunc('hour', "createdAt") AS "hour", "repositoryUrl", COUNT(*)::int AS "count"
			FROM "ChatLog"
			WHERE "createdAt" >= ${since}
			  AND "repositoryUrl" IS NOT NULL
			  AND "repositoryUrl" ~ ${allowRegex}
			GROUP BY 1, 2
			ORDER BY 1 ASC
		`,
		prisma.$queryRaw<
			{ repositoryUrl: string; inRange: number; total: number; users: number; lastUsed: Date | null }[]
		>`
			SELECT "repositoryUrl",
			       COUNT(*) FILTER (WHERE "createdAt" >= ${since})::int AS "inRange",
			       COUNT(*)::int AS "total",
			       COUNT(DISTINCT "username") FILTER (WHERE "createdAt" >= ${since})::int AS "users",
			       MAX("createdAt") AS "lastUsed"
			FROM "ChatLog"
			WHERE "repositoryUrl" IS NOT NULL
			  AND "repositoryUrl" ~ ${allowRegex}
			GROUP BY 1
			ORDER BY "inRange" DESC, "total" DESC
		`,
		prisma.repository.findMany({ select: { url: true, name: true } })
	]);

	const nameByUrl = new Map(repos.map((repo) => [repo.url, repo.name]));
	const repositories: RepoSummary[] = summaryRows.map((row) => ({
		...row,
		name: nameByUrl.get(row.repositoryUrl) ?? null
	}));

	return { days, rangeDays: RANGE_DAYS, items, buckets, repositories };
};
