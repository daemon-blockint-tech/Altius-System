/**
 * Live data push / auto-refresh REST routes.
 *
 *   POST /api/v1/{plural}/aggregate/poll
 *   POST /api/v1/object-sets/:id/refresh
 */

export { generateObjectLiveDataRoutes, generateLiveDataRoutes } from './fase21-routes.js';
