export default async function () {
  // If isolation works, the parent's secret is simply not here.
  return { saw: process.env.ALTIUS_TEST_SECRET ?? null, envKeys: Object.keys(process.env).sort() };
}
