import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const shopState = sqliteTable('shop_state', { id: integer('id').primaryKey(), revision: integer('revision').notNull(), body: text('body').notNull() });
export const sharedState = sqliteTable('shared_state', { id: integer('id').primaryKey(), revision: integer('revision').notNull(), generation: text('generation').notNull() });
export const sharedStateParts = sqliteTable('shared_state_parts', { position: integer('position').primaryKey(), body: text('body').notNull() });
