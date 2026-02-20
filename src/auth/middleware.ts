import {
  clerkMiddleware as _clerkMiddleware,
  getAuth,
} from "@clerk/express";
import { type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

export const clerkMiddleware = _clerkMiddleware();

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

/**
 * Resolves the Clerk user to an internal user ID.
 * Auto-creates the user row on first login.
 */
export async function resolveUserId(req: Request): Promise<string> {
  const auth = getAuth(req);
  if (!auth?.userId) {
    throw new Error("Not authenticated");
  }

  const clerkId = auth.userId;
  const db = getDb();

  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.clerkId, clerkId))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(schema.users)
    .values({ clerkId })
    .returning({ id: schema.users.id });

  return created.id;
}
