import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const shopState = sqliteTable('shop_state', { id: integer('id').primaryKey(), revision: integer('revision').notNull(), body: text('body').notNull() });
