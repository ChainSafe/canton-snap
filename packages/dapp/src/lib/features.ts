// SPDX-License-Identifier: Apache-2.0

/**
 * Build-time feature flags. Read from Vite env so each deployment can opt in
 * without rebuilding the source.
 *
 * NON_CUSTODIAL_ENABLED — gates the registration-choice screen and the
 * snap-backed registration flow. v1.0 ships custodial-only (flag off); the
 * non-custodial code remains in the tree and is re-enabled by setting
 * VITE_ENABLE_NON_CUSTODIAL=true at build time. Account-aware UI (dashboard
 * pages, transfer flow) is unaffected because those branches off
 * profile.keyMode, not this flag.
 */

export const NON_CUSTODIAL_ENABLED = import.meta.env.VITE_ENABLE_NON_CUSTODIAL === "true";
