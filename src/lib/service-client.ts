import 'server-only';
import { fullAppEnabled } from './neon-preview/config';
import { createNeonServiceClient } from './neon-app/services';
import { createAdminClient as supabaseAdmin } from './supabase/admin';

export function createAdminClient() {
  return fullAppEnabled() ? createNeonServiceClient() : supabaseAdmin();
}
export function createCacheClient() {
  return fullAppEnabled() ? createNeonServiceClient('cache') : supabaseAdmin();
}
