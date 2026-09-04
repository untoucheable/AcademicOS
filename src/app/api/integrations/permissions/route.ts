import { automationProviders } from "@/lib/automation";
import { AcademicSourceProvider } from "@/lib/academic-core";
import { getState, updateState } from "@/lib/server-state";
import { setIntegrationPermission } from "@/lib/permissions";
import { syncIntegrationConnection } from "@/lib/sync-service";

function countProviderUsage(
  state: Awaited<ReturnType<typeof getState>>,
  provider: AcademicSourceProvider,
) {
  return {
    assignments: state.assignments.filter((item) => item.source?.provider === provider).length,
    documents: state.documents.filter((item) => item.source?.provider === provider).length,
    calendarEvents: state.calendar.filter((item) => item.source === provider).length,
    reviewItems: state.ingestionReviewQueue.filter((item) => item.payload.source.provider === provider).length,
  };
}

export async function GET() {
  try {
  const state = await getState();

  return Response.json({
    providers: automationProviders.map((provider) => {
      const permission = state.integrationPermissions.find(
        (item) => item.provider === provider.provider
      );

      return {
        ...provider,
        permission: permission || {
          provider: provider.provider,
          enabled: false,
          scopes: provider.scopes,
        },
        usage: countProviderUsage(state, provider.provider),
      };
    }),
    reviewItems: state.ingestionReviewQueue.length,
    signals: state.academicSignals,
    dailyBriefings: state.dailyBriefings.slice(0, 3),
  });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Integration permissions load failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { provider, enabled } = await req.json();
    const providerConfig = automationProviders.find((item) => item.provider === provider);

    if (!providerConfig || typeof enabled !== "boolean") {
      return Response.json(
        { error: "A valid provider and enabled value are required." },
        { status: 400 }
      );
    }

    const updated = await updateState((state) =>
        syncIntegrationConnection(
          setIntegrationPermission(state, providerConfig.provider, providerConfig.scopes, enabled),
          providerConfig.provider,
          enabled ? `Connected ${providerConfig.label}` : `Disconnected ${providerConfig.label}`,
          0,
          "success",
          enabled,
        )
      );
    const permission = updated.integrationPermissions.find(
      (item) => item.provider === providerConfig.provider
    );

    return Response.json({
      provider: providerConfig.provider,
      permission,
      usage: countProviderUsage(updated, providerConfig.provider),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Permission update failed";

    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
