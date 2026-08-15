/**
 * Fixture: a function that reads an object instead of only doing arithmetic.
 * This is what a Foundry "function on objects" does, and what Altius functions
 * could not do — the runtime handed pack code only { log }.
 */
export default async function readObject(inputs, helpers) {
  const patient = await helpers.ontology.getObject('Patient', inputs.patientId);
  return { name: patient?.name ?? null, sawFields: Object.keys(patient ?? {}).sort() };
}
