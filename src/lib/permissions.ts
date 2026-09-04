import { AcademicSourceProvider, IntegrationPermission } from "./academic-core";
import { StudentState } from "./student-state";

export function hasIntegrationPermission(
  state: StudentState,
  provider: AcademicSourceProvider,
  scope: string
) {
  return state.integrationPermissions.some(
    (permission) =>
      permission.provider === provider &&
      permission.enabled &&
      permission.scopes.includes(scope)
  );
}

export function setIntegrationPermission(
  state: StudentState,
  provider: AcademicSourceProvider,
  scopes: string[],
  enabled: boolean
): StudentState {
  const now = new Date().toISOString();
  const nextPermission: IntegrationPermission = {
    provider,
    scopes,
    enabled,
    grantedAt: enabled ? now : undefined,
    revokedAt: enabled ? undefined : now,
  };

  return {
    ...state,
    integrationPermissions: [
      ...state.integrationPermissions.filter((permission) => permission.provider !== provider),
      nextPermission,
    ],
  };
}
