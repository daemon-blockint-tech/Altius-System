/**
 * Testing Library unmounts between tests via a global `afterEach` hook, which
 * it only installs when vitest runs with `globals: true`. This project runs
 * with globals off, so the cleanup has to be registered explicitly — without
 * it every render stacks up in the same document and queries start matching
 * elements from earlier tests.
 */

import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
