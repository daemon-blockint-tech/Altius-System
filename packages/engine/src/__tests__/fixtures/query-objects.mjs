/**
 * Fixture: a function that operates on an object *set*, not one object by id.
 * Fetching a single object by primary key is the weakest thing a
 * "function on objects" can do; this is the shape real ones take.
 */
export default async function queryObjects(inputs, helpers) {
  const rows = await helpers.ontology.queryObjects('Patient', {
    field: 'ward', operator: 'eq', value: inputs.ward,
  });
  return { count: rows.length, names: rows.map(r => r.name).sort() };
}
