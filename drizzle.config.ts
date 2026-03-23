import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: [
    './modules/cost-tracking/schema/index.ts',
    './packages/@core/identity/schema/index.ts',
  ],
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
