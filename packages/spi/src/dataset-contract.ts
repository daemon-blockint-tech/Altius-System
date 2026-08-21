/**
 * Failure modes shared by every DatasetService implementation.
 *
 * A contract that only exists as prose gets restated per provider, and a
 * restatement drifts: the in-memory service's `create` silently replaced an
 * existing dataset, which is a dev annoyance in a Map and irrecoverable data
 * loss in Postgres. The same call, the same arguments, two outcomes depending
 * on which provider happened to be wired — dev green, production destroyed.
 *
 * So the refusals live here as factories both providers call. They carry an
 * `ErrorCode`, which is what the REST layer reads to choose a status: without
 * one, a deliberate refusal is indistinguishable from a crash and the caller
 * gets a 500 with the message withheld.
 */

/** An error carrying an Altius error code, which the transports map to a status. */
export interface CodedError extends Error {
  code: string;
}

function coded(code: string, message: string): CodedError {
  return Object.assign(new Error(message), { code });
}

/**
 * A dataset of this name already exists — `create` refuses rather than
 * replacing it. Maps to 409.
 *
 * Refusing is the non-destructive option that also stays honest: silently
 * returning the existing dataset would make `create` succeed without having
 * created anything, so a caller whose schema differed from the stored one
 * would carry on believing its own.
 */
export function datasetAlreadyExistsError(name: string): CodedError {
  return coded('ALREADY_EXISTS', `Dataset already exists: ${name}`);
}

/** No dataset of this name in this tenant. Maps to 404. */
export function datasetNotFoundError(name: string): CodedError {
  return coded('OBJECT_NOT_FOUND', `Dataset not found: ${name}`);
}

/** A branch of this name already exists on the dataset. Maps to 409. */
export function datasetBranchExistsError(branch: string): CodedError {
  return coded('ALREADY_EXISTS', `Branch already exists: ${branch}`);
}

/** No branch of this name on the dataset. Maps to 404. */
export function datasetBranchNotFoundError(label: string, branch: string): CodedError {
  return coded('OBJECT_NOT_FOUND', `${label} branch not found: ${branch}`);
}
