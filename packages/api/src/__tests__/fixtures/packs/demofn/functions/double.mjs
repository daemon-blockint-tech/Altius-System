/**
 * Entry module for the demofn pack's Doubler function.
 *
 * It lives under demofn/functions/, not core/functions/ — resolving it
 * against the wrong pack directory is precisely the failure this fixture
 * exists to catch.
 */
export default async function double(inputs) {
  return { doubled: inputs.value * 2 };
}
