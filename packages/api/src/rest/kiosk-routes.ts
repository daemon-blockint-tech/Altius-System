/**
 * Kiosk mode REST routes.
 *
 *   POST   /api/v1/kiosk/sessions
 *   GET    /api/v1/kiosk/sessions
 *   GET    /api/v1/kiosk/sessions/:id
 *   POST   /api/v1/kiosk/sessions/:id/refresh
 *   POST   /api/v1/kiosk/sessions/:id/revoke
 *   GET    /api/v1/kiosk/sessions/:id/access/:objectType
 */

export { generateKioskRoutes } from './api-tooling-routes.js';
