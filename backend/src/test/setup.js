import mongoose from "mongoose";
import { beforeAll, afterAll, afterEach } from "vitest";

// dotenv (loaded transitively via lib/stream.js) pulls the developer's real
// .env into tests. Blank out the embeddings key so no test can ever hit the
// real embeddings API — tests that need vectors mock lib/embeddings.js.
process.env.GEMINI_API_KEY = "";

const TEST_MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/speakzy_test";

beforeAll(async () => {
  await mongoose.connect(TEST_MONGO_URI);
});

afterEach(async () => {
  // Clear all collections between tests so each test starts from a clean slate,
  // without needing a fresh connection per test (which would be much slower).
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});