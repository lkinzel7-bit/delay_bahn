import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

const envPath = path.resolve(process.cwd(), ".env");
const loaded = dotenv.config({ path: envPath });

console.log("Loaded .env from:", envPath);
console.log("Parsed keys:", Object.keys(loaded.parsed || {}));
console.log("DATABASE_URL exists:", Boolean(process.env.DATABASE_URL));

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
