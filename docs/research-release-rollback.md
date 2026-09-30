# Research release recovery reference

Owner authorized the production migration, PR #2 merge and deployment on September 30, 2026, including application rollback if a release issue is found.

## Known-good production before release

- Commit: `34db329a4902ee6de62a5d28238d36281022bda6`.
- Vercel deployment: `dpl_BR1BRzbeHmZ6UhtZy8Ae8NNNi2aH` (READY, production).
- Deployment URL: `https://poshkan-v2-n7jrsize4-afzjavan-7827s-projects.vercel.app`.
- Project: `poshkan-v2`, team `afzjavan-7827s-projects`.
- Production domains include `www.poshkan.com`, `poshkan.com`, and `trade.poshkan.com`.
- Database: Neon `neondb`, schema `poshkan_live`; source Supabase is frozen and is not the rollback database.

Before migration take a fresh custom-format dump of `poshkan_live` with PostgreSQL 18 tools into the owner's existing `Documents/Poshkan Backup` directory. Verify its archive catalog and SHA-256; keep data and credentials out of Git. The archive requires existing roles and external Neon Auth objects when restored into an isolated recovery database. It is a recovery snapshot, not a reason to overwrite later live records.

## Release order

1. Confirm exact PR checks, deployment identity, owner access, and fresh backup.
2. Generate `node scripts/prepare-research-upgrade.mjs --production`. Apply the complete additive transaction using existing owner access, with bounded lock and statement timeouts. Check original account, position, order, and transaction values are unchanged inside the migration transaction.
3. Verify schema, owner RLS, denied direct writes, retained app/service grants, and runtime read-only access. Profiles remain empty: defaults charge zero costs.
4. Merge PR #2 after exact-head checks pass. The existing main Git integration deploys production; CI also runs on the resulting main commit.
5. Confirm production deployment and exact commit, then check public pages, authentication boundaries and authenticated `GET /api/cron/market-check?status=1`. Do not call an execution cron without `status=1`, or place trades/reset accounts for smoke testing.

## Application rollback

Using existing authenticated Vercel CLI access:

```powershell
npx --yes vercel rollback https://poshkan-v2-n7jrsize4-afzjavan-7827s-projects.vercel.app --scope afzjavan-7827s-projects --yes
npx --yes vercel inspect https://www.poshkan.com
```

Confirm the aliases resolve to the known-good deployment and repeat public/read-only health checks. If the instant rollback command is unavailable under the existing plan, use the supported `vercel promote` workflow on that READY deployment. Record the incident and exact rollback outcome; do not create credentials or widen access. A later main push can deploy again, so fix/revert the source regression on a branch and review before another release.

Retain the additive schema, current cost-aware SQL engine, journal/reviews/links, profiles and transaction metadata. Existing server callers remain compatible with the SQL signatures. Never drop the new tables/columns, recost old transactions, revert balances or restore the pre-release archive over live data. Cost-bearing fills after release keep their fee-inclusive basis and net proceeds. The older application lacks the research UI and can omit/misstate cost details in its legacy P&L reconstruction; use the stored authoritative ledger and a compatible corrective release to restore reporting. The database engine continues authoritative cash and limit checks even if older UI estimates omit fees. If this reporting limitation is material, prefer a forward fix to blind source rollback. Database damage needs a separate reviewed reconciliation preserving all post-release records.

No exchange execution fidelity is implied. Production smoke checks avoid financial mutations; synthetic tests cover execution accounting. Authenticated browser workflows still require the owner's existing login and are not replaced by public smoke checks.
