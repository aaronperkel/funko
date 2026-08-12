import { config } from 'dotenv';

/**
 * Next.js loads .env.local automatically; standalone tsx scripts do not.
 * dotenv never overrides an already-set variable, so loading .env.local first
 * gives it precedence over .env, matching Next's own ordering.
 */
config({ path: '.env.local' });
config({ path: '.env' });
