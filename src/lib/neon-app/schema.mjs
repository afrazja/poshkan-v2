// Identifiers are constants, never request input or a free-form environment value.
// Production cannot select the rehearsal schema, even if preview flags are set.
export function databaseSchema() {
  return process.env.POSHKAN_DATABASE_MODE === 'neon' ? 'poshkan_live' : 'poshkan_trade_test';
}
