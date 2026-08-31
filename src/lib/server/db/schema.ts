import { pgTable, uuid, text, boolean, timestamp, primaryKey, integer, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
	id: uuid('id').primaryKey(),
	email: text('email').notNull().unique(),
	name: text('name').notNull(),
	isAdmin: boolean('is_admin').notNull().default(false)
});

export const socialAccounts = pgTable('social_accounts', {
	id: uuid('id').primaryKey().defaultRandom(),
	platform: text('platform').notNull().default('instagram'),
	label: text('label').notNull(),
	igBusinessId: text('ig_business_id').notNull(),
	fbPageId: text('fb_page_id').notNull(),
	accessToken: text('access_token').notNull(),
	tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
	locationId: text('location_id'),
	locationName: text('location_name'),
	aiInstructions: text('ai_instructions'),
	deletedAt: timestamp('deleted_at', { withTimezone: true })
});

export const userAccountAccess = pgTable(
	'user_account_access',
	{
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		accountId: uuid('account_id')
			.notNull()
			.references(() => socialAccounts.id, { onDelete: 'cascade' }),
		canAccessSocial: boolean('can_access_social').notNull().default(true),
		canAccessTickets: boolean('can_access_tickets').notNull().default(true),
		canAccessLineups: boolean('can_access_lineups').notNull().default(false)
	},
	(t) => [primaryKey({ columns: [t.userId, t.accountId] })]
);

export const scheduledPosts = pgTable('scheduled_posts', {
	id: uuid('id').primaryKey().defaultRandom(),
	accountId: uuid('account_id')
		.notNull()
		.references(() => socialAccounts.id),
	createdBy: uuid('created_by')
		.notNull()
		.references(() => users.id),
	type: text('type').notNull(), // 'feed' | 'story' | 'carousel'
	caption: text('caption'),
	mediaUrl: text('media_url').notNull(),
	carouselItems: text('carousel_items'), // JSON: string[] of media URLs (carousel type only)
	userTags: text('user_tags'), // JSON: string[] of IG usernames to tag
	scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
	status: text('status').notNull().default('pending'), // 'pending' | 'publishing' | 'published' | 'failed' | 'cancelled'
	errorMessage: text('error_message'),
	thumbnailUrl: text('thumbnail_url'),
	publishedAt: timestamp('published_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const captionSnippets = pgTable('caption_snippets', {
	id: uuid('id').primaryKey().defaultRandom(),
	accountId: uuid('account_id')
		.notNull()
		.references(() => socialAccounts.id, { onDelete: 'cascade' }),
	label: text('label').notNull(),
	text: text('text').notNull(),
	useInAi: boolean('use_in_ai').notNull().default(false),
	sortOrder: integer('sort_order').notNull().default(0),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const tagSnippets = pgTable('tag_snippets', {
	id: uuid('id').primaryKey().defaultRandom(),
	accountId: uuid('account_id')
		.notNull()
		.references(() => socialAccounts.id, { onDelete: 'cascade' }),
	label: text('label').notNull(),
	username: text('username').notNull(),
	category: text('category'), // 'venue' | 'act' | 'mc' | null
	useInAi: boolean('use_in_ai').notNull().default(false),
	sortOrder: integer('sort_order').notNull().default(0),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Shows — recurring events under an account, linked to Humanitix/Eventbrite
export const shows = pgTable('shows', {
	id: uuid('id').primaryKey().defaultRandom(),
	accountId: uuid('account_id')
		.notNull()
		.references(() => socialAccounts.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	humanitixEventId: text('humanitix_event_id'),
	eventbriteEventId: text('eventbrite_event_id'),
	isActive: boolean('is_active').notNull().default(true),
	capacity: integer('capacity'),
	aiInstructions: text('ai_instructions'),
	// Lineup scheduling
	scheduleType: text('schedule_type'), // 'weekly' | 'fortnightly' | 'monthly' | 'one_off' | null
	scheduleDayOfWeek: integer('schedule_day_of_week'), // 0=Sun … 6=Sat; null for one_off/monthly
	actsPerShow: integer('acts_per_show'), // target act count, drives over-capacity warning
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Global talent directory
export const people = pgTable('people', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	instagram: text('instagram'), // handle or full URL
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// One lineup per show per date
export const lineups = pgTable('lineups', {
	id: uuid('id').primaryKey().defaultRandom(),
	showId: uuid('show_id')
		.notNull()
		.references(() => shows.id, { onDelete: 'cascade' }),
	showDate: text('show_date').notNull(), // YYYY-MM-DD (Melbourne time)
	notes: text('notes'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [
	uniqueIndex('uq_lineups_show_date').on(t.showId, t.showDate)
]);

// Individual act slots within a lineup
export const lineupEntries = pgTable('lineup_entries', {
	id: uuid('id').primaryKey().defaultRandom(),
	lineupId: uuid('lineup_id')
		.notNull()
		.references(() => lineups.id, { onDelete: 'cascade' }),
	personId: uuid('person_id').references(() => people.id, { onDelete: 'set null' }),
	name: text('name').notNull(), // copied from person or typed freehand
	role: text('role').notNull().default('act'), // 'act' | 'headline' | 'mc' | 'support' | 'host'
	status: text('status').notNull().default('to_contact'), // 'to_contact' | 'booked' | 'cancelled'
	sortOrder: integer('sort_order').notNull().default(0),
	notes: text('notes'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// Cached ticket data per show per date — upserted each poll cycle
export const ticketSnapshots = pgTable('ticket_snapshots', {
	id: uuid('id').primaryKey().defaultRandom(),
	showId: uuid('show_id')
		.notNull()
		.references(() => shows.id, { onDelete: 'cascade' }),
	showDate: text('show_date').notNull(), // YYYY-MM-DD in Melbourne time
	totalSold: integer('total_sold').notNull().default(0),
	totalCapacity: integer('total_capacity').notNull().default(0),
	humanitixData: jsonb('humanitix_data'), // { date_id, total_sold, total_capacity, ticket_types[] }
	eventbriteData: jsonb('eventbrite_data'),
	fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [
	uniqueIndex('uq_ticket_snapshots_show_date').on(t.showId, t.showDate)
]);
