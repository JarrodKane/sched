import { pgTable, uuid, text, boolean, timestamp, primaryKey } from 'drizzle-orm/pg-core';

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
	tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true })
});

export const userAccountAccess = pgTable(
	'user_account_access',
	{
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		accountId: uuid('account_id')
			.notNull()
			.references(() => socialAccounts.id, { onDelete: 'cascade' })
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
	type: text('type').notNull(), // 'feed' | 'story'
	caption: text('caption'),
	mediaUrl: text('media_url').notNull(),
	scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
	status: text('status').notNull().default('pending'), // 'pending' | 'publishing' | 'published' | 'failed'
	errorMessage: text('error_message'),
	publishedAt: timestamp('published_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
