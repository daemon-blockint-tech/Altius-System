/**
 * Stands in for pack-authored function code and reports what it can see of the
 * host process environment. Used to prove which runtime leaks gateway secrets.
 */
export default async function envProbe() {
  return { secret: process.env.ALTIUS_TEST_SECRET ?? null };
}
