import Link from 'next/link';
import { productionEnabled } from '@/lib/neon-preview/config';
import { ResetForm } from '@/app/neon-preview/forms';
import SupabaseReset from './supabase-reset';

export default async function ResetPage({ searchParams }: { searchParams: Promise<{token?: string; error?: string}> }) {
  if (!productionEnabled()) return <SupabaseReset />;
  const query = await searchParams;
  const token = typeof query.token === 'string' ? query.token : '';
  return <main className="flex min-h-screen items-center justify-center p-6">
    <section className="w-full max-w-md rounded-2xl border border-border bg-card p-8">
      <h1 className="mb-6 text-2xl font-semibold">Choose your password</h1>
      {token && !query.error ? <ResetForm token={token} /> : <p role="alert">This link is invalid or expired. Request a new link from the login page.</p>}
      <Link href="/signup?tab=login" className="mt-6 inline-block text-primary underline">Back to login</Link>
    </section>
  </main>;
}
