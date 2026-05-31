import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
  boolean,
} from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ADMIN_ROLES = ["admin", "office", "finance", "commercial"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const adminsTable = mysqlTable("admins", {
  id: int("id").primaryKey().autoincrement(),
  username: varchar("username", { length: 100 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().default("admin"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const partnersTable = mysqlTable("partners", {
  id: int("id").primaryKey().autoincrement(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 200 }).notNull(),
  password: varchar("password", { length: 200 }),
  phone: varchar("phone", { length: 50 }).notNull(),
  address: text("address").notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  parcelsPerMonth: varchar("parcels_per_month", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const officesTable = mysqlTable("offices", {
  id: int("id").primaryKey().autoincrement(),
  wilayaNumber: int("wilaya_number").notNull(),
  wilaya: varchar("wilaya", { length: 100 }).notNull(),
  commune: varchar("commune", { length: 100 }),
  address: text("address").notNull(),
  phone: varchar("phone", { length: 50 }),
  mapsUrl: text("maps_url").notNull(),
  isPrincipal: boolean("is_principal").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPartnerSchema = createInsertSchema(partnersTable).omit({
  id: true, status: true, notes: true, createdAt: true, updatedAt: true,
});
export const selectPartnerSchema = createSelectSchema(partnersTable);
export type InsertPartner = z.infer<typeof insertPartnerSchema>;
export type Partner = typeof partnersTable.$inferSelect;

export const insertOfficeSchema = createInsertSchema(officesTable).omit({
  id: true, createdAt: true,
});
export const selectOfficeSchema = createSelectSchema(officesTable);
export type InsertOffice = z.infer<typeof insertOfficeSchema>;
export type Office = typeof officesTable.$inferSelect;

export type Admin = typeof adminsTable.$inferSelect;

export const ORDER_STATUSES = ["pending", "in_transit", "delivered", "returned", "failed", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ordersTable = mysqlTable("orders", {
  id: int("id").primaryKey().autoincrement(),
  trackingNumber: varchar("tracking_number", { length: 100 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  senderName: varchar("sender_name", { length: 100 }),
  recipientName: varchar("recipient_name", { length: 100 }),
  destinationWilayaCode: varchar("destination_wilaya_code", { length: 10 }),
  destinationWilaya: varchar("destination_wilaya", { length: 100 }),
  originWilayaCode: varchar("origin_wilaya_code", { length: 10 }),
  originWilaya: varchar("origin_wilaya", { length: 100 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export type Order = typeof ordersTable.$inferSelect;

export const chargesTable = mysqlTable("charges", {
  id: int("id").primaryKey().autoincrement(),
  category: varchar("category", { length: 50 }).notNull(),
  amountDzd: int("amount_dzd").notNull().default(0),
  description: text("description"),
  chargeDate: varchar("charge_date", { length: 10 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const payoutsTable = mysqlTable("payouts", {
  id: int("id").primaryKey().autoincrement(),
  category: varchar("category", { length: 50 }).notNull().default("general"),
  amountDzd: int("amount_dzd").notNull().default(0),
  method: varchar("method", { length: 50 }).default("virement"),
  reference: varchar("reference", { length: 100 }),
  notes: text("notes"),
  payoutDate: varchar("payout_date", { length: 10 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const officeReportsTable = mysqlTable("office_reports", {
  id: int("id").primaryKey().autoincrement(),
  reportType: varchar("report_type", { length: 30 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  reportDate: varchar("report_date", { length: 10 }).notNull(),
  totalParcels: int("total_parcels").notNull().default(0),
  totalAmountDzd: int("total_amount_dzd").notNull().default(0),
  netAmountDzd: int("net_amount_dzd").notNull().default(0),
  fraisLivraisonDzd: int("frais_livraison_dzd").notNull().default(0),
  station: varchar("station", { length: 255 }),
  senderName: varchar("sender_name", { length: 255 }),
  trackingNumbers: text("tracking_numbers"),
  wilayas: text("wilayas"),
  uploadedBy: varchar("uploaded_by", { length: 100 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Charge = typeof chargesTable.$inferSelect;
export type Payout = typeof payoutsTable.$inferSelect;
export type OfficeReport = typeof officeReportsTable.$inferSelect;
