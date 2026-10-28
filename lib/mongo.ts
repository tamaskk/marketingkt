import "server-only";
import { MongoClient, type Db } from "mongodb";

const g = globalThis as unknown as { mongoDb?: Promise<Db> };

async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Hiányzó környezeti változó: MONGODB_URI");
  const db = (await new MongoClient(uri, { ignoreUndefined: true }).connect()).db("marketing-hub");
  await Promise.all([
    db.collection("posts").createIndex({ projectId: 1, externalId: 1 }, { unique: true }),
    db.collection("posts").createIndex({ projectId: 1, section: 1, scheduledAt: 1 }),
    db.collection("posts").createIndex({ projectId: 1, "source.automationId": 1, localDate: 1 }),
    db.collection("batches").createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }),
  ]);
  return db;
}

// Cached on globalThis so dev hot reloads reuse one connection.
export function mongo() {
  g.mongoDb ??= connect().catch((e) => {
    g.mongoDb = undefined;
    throw e;
  });
  return g.mongoDb;
}
