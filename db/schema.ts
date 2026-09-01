import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const agents = sqliteTable(
  'agents',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    role: text('role', { enum: ['admin', 'agent'] }).notNull().default('agent'),
    userId: text('user_id'),
    userEmail: text('user_email'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('idx_agents_code').on(table.code),
    uniqueIndex('idx_agents_user_id').on(table.userId),
    index('idx_agents_active_role').on(table.active, table.role),
  ],
);

export const activityDefinitions = sqliteTable(
  'activity_definitions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    code: text('code').notNull(),
    labelZh: text('label_zh').notNull(),
    labelEn: text('label_en').notNull(),
    points: integer('points').notNull(),
    sortOrder: integer('sort_order').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
  },
  (table) => [uniqueIndex('idx_activity_definitions_code').on(table.code)],
);

export const dailyActivity = sqliteTable(
  'daily_activity',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    agentId: integer('agent_id').notNull().references(() => agents.id),
    activityId: integer('activity_id').notNull().references(() => activityDefinitions.id),
    activityDate: text('activity_date').notNull(),
    completed: integer('completed', { mode: 'boolean' }).notNull().default(true),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('idx_daily_agent_date_activity').on(table.agentId, table.activityDate, table.activityId),
    index('idx_daily_agent_date').on(table.agentId, table.activityDate),
  ],
);

export const weeklyReviews = sqliteTable(
  'weekly_reviews',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    agentId: integer('agent_id').notNull().references(() => agents.id),
    weekStart: text('week_start').notNull(),
    strongestAction: text('strongest_action').notNull().default(''),
    biggestGap: text('biggest_gap').notNull().default(''),
    topProspects: text('top_prospects').notNull().default(''),
    nextImprovement: text('next_improvement').notNull().default(''),
    nextCaseTarget: text('next_case_target').notNull().default(''),
    nextTpcTarget: text('next_tpc_target').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex('idx_weekly_agent_week').on(table.agentId, table.weekStart)],
);
