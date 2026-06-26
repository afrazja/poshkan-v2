-- Bring-your-own-key: each user's own Anthropic API key, AES-256-GCM encrypted
-- at rest (see src/lib/crypto.ts). Never exposed to the client.
alter table public.profiles add column if not exists anthropic_api_key text;
