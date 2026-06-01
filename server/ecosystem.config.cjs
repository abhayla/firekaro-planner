/**
 * PM2 process config for the FireKaro v6 backend (Hono + Prisma → Supabase).
 *
 * Runs the TypeScript entry directly via tsx's Node loader (no build step).
 * Secrets come from `server/.env` (loaded by `import "dotenv/config"` in
 * src/index.ts) — do NOT put DATABASE_URL / BETTER_AUTH_SECRET here.
 *
 * NODE_ENV is forced to "production" here: PM2 sets it before the process
 * starts, and dotenv will NOT overwrite an already-set var — so this is the
 * authoritative production signal (and satisfies the validate-env boot guard
 * that refuses to run the dev-bypass outside an explicit dev/test env).
 *
 * Deploy:  cd /var/www/firekaro/server && pm2 start ecosystem.config.cjs
 * Reload:  pm2 reload firekaro-api      (zero-downtime)
 * Logs:    pm2 logs firekaro-api
 * Boot:    pm2 startup && pm2 save      (resurrect on VPS reboot)
 */
module.exports = {
  apps: [
    {
      name: "firekaro-api",
      cwd: __dirname,
      script: "src/index.ts",
      interpreter: "node",
      interpreter_args: "--import tsx", // Node 20.6+ loader for TypeScript
      instances: 1, // in-memory rate-limit store is single-node — see rate-limit.ts
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      max_memory_restart: "350M",
      env: {
        NODE_ENV: "production",
        PORT: "3100",
        DEV_BYPASS_AUTH: "false", // never enable the bypass in production
      },
      time: true, // prefix log lines with timestamps
    },
  ],
};
