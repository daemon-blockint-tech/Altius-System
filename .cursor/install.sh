#!/usr/bin/env bash
# Cloud Agent install for the Altius pnpm/turbo monorepo.
#
# The ordering here works around a workspace bootstrap chicken-and-egg problem:
# several packages (e.g. @altius/sdk) run `odl generate ...` in a prebuild step,
# where `odl` is the CLI bin exposed by @altius/odl. pnpm only links a workspace
# package's bin when its target file already exists at install time, but that
# target (packages/odl/dist/cli/index.js) does not exist until @altius/odl is
# built. So on a clean checkout the first install cannot link `.bin/odl`, and a
# straight `pnpm run build` fails with "odl: not found".
#
# The fix: install, build only @altius/odl so its dist exists, re-run install
# with --force to (re)link the now-resolvable `odl` bin, then build everything.
set -euo pipefail

corepack enable

pnpm install --frozen-lockfile

# Build @altius/odl first so its CLI entrypoint exists before bins are linked.
pnpm --filter @altius/odl run build

# Re-link workspace bins (notably `odl`) now that the target exists.
pnpm install --frozen-lockfile --force

# Build the whole workspace so the environment is ready to typecheck and test.
pnpm run build
