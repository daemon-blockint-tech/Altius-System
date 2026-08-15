export default async function (inputs, { log }) {
  log('INFO', `got ${Object.keys(inputs).length} input(s)`);
  return { doubled: Number(inputs.n) * 2 };
}
