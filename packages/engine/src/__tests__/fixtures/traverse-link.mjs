/**
 * Fixture: a function that walks a relationship.
 * Reading one object, or one type, is not what makes an ontology an ontology —
 * the links are. A function that cannot traverse them is working on a table.
 */
export default async function traverseLink(inputs, helpers) {
  const wards = await helpers.ontology.getLinkedObjects('Patient', inputs.patientId, 'AdmittedTo');
  return { count: wards.length, ids: wards.map(w => w._id).sort() };
}
