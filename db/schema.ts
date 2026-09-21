import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** One private schedule document per signed-in Squitle user. */
export const syncDocuments = sqliteTable("sync_documents", {
  userId: text("user_id").primaryKey(),
  documentId: text("document_id").notNull(),
  serverRevision: integer("server_revision").notNull(),
  documentJson: text("document_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Multiple private timeline documents per signed-in Squitle user. */
export const syncTimelines = sqliteTable("sync_timelines", {
  userId: text("user_id").notNull(),
  documentId: text("document_id").notNull(),
  title: text("title").notNull(),
  serverRevision: integer("server_revision").notNull(),
  documentJson: text("document_json").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [primaryKey({columns:[table.userId,table.documentId]})]);
