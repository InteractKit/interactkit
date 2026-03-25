/**
 * Config resolution — reads adapter configuration.
 * Uses node-config first, then env vars. Throws if not configured.
 */
import config from 'config';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  url?: string;
}

export interface DatabaseConfig {
  url: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required config: set ${name} env var or configure via node-config (interactkit.*)`);
  return value;
}

export function resolveRedisConfig(): RedisConfig {
  if (config.has('interactkit.redis')) {
    return config.get('interactkit.redis');
  }

  if (process.env.REDIS_URL) {
    return { url: process.env.REDIS_URL, host: '', port: 0 };
  }

  return {
    host: requireEnv('REDIS_HOST'),
    port: parseInt(requireEnv('REDIS_PORT'), 10),
    password: process.env.REDIS_PASSWORD,
    db: process.env.REDIS_DB ? parseInt(process.env.REDIS_DB, 10) : undefined,
  };
}

export function resolveDatabaseConfig(): DatabaseConfig {
  if (config.has('interactkit.database')) {
    return config.get('interactkit.database');
  }

  return {
    url: requireEnv('DATABASE_URL'),
  };
}
