/**
 * Ontology change history REST routes.
 *
 *   GET    /api/v1/ontology/changes
 *   GET    /api/v1/ontology/changes/:id
 *   POST   /api/v1/ontology/changes/:id/restore
 */

export { generateOntologyChangeHistoryRoutes } from './api-tooling-routes.js';
