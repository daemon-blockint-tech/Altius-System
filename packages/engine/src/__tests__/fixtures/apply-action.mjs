/**
 * Fixture: a function that changes the ontology.
 *
 * It does not write. It asks the platform to run a declared action, so the
 * governed pipeline — validation, authorization, preconditions, audit,
 * events — still runs. A write handle here would bypass all of it.
 */
export default async function applyAction(inputs, helpers) {
  const res = await helpers.ontology.applyAction('AdmitPatient', {
    patientId: inputs.patientId,
    wardId: inputs.wardId,
  });
  return { applied: res?.success === true, actionId: res?.actionId ?? null };
}
