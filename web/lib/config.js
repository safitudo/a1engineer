/**
 * Central configuration for server-side web routes.
 * Override MANAGER_API_URL in the environment to point at a non-default manager.
 */
export const MANAGER_URL = process.env.MANAGER_API_URL ?? 'http://localhost:8080'
