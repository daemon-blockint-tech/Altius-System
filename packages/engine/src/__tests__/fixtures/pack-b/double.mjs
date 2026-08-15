/** Lives only in "pack B" — resolving it against another pack's dir must fail. */
export default async function double(inputs) {
  return { doubled: Number(inputs.value) * 2 };
}
