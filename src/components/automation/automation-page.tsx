"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  Brain,
  CalendarClock,
  Database,
  FileSearch,
  Globe,
  GraduationCap,
  Inbox,
  LockKeyhole,
  RefreshCw,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Unplug,
} from "lucide-react";
import { Header } from "@/components/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/ui/loading";
import { Toggle } from "@/components/ui/toggle";
import { automationCategories } from "@/lib/automation";
import { AcademicSignal } from "@/lib/academic-core";

type ProviderStatus = {
  provider: string;
  label: string;
  category: string;
  description: string;
  scopes: string[];
  capabilities: string[];
  status: "available" | "planned";
  permission: {
    enabled: boolean;
    scopes: string[];
    grantedAt?: string;
    revokedAt?: string;
  };
  usage: {
    assignments: number;
    documents: number;
    calendarEvents: number;
    reviewItems: number;
  };
};

type AutomationOverview = {
  providers: ProviderStatus[];
  reviewItems: number;
  signals: AcademicSignal[];
  dailyBriefings: Array<{
    id: string;
    title: string;
    summary: string;
    createdAt: string;
  }>;
};

type GoogleCalendarStatus = {
  connected: boolean;
  accountEmail: string | null;
  grantedScopes: string[];
  lastSyncAt: string | null;
  tokenExpiryStatus: string;
  tokenExpiresAt: string | null;
  latestError: string | null;
};

type IntegrationStatus = {
  connected: boolean;
  accountEmail: string | null;
  accountName?: string | null;
  grantedScopes: string[];
  lastSyncAt: string | null;
  tokenExpiryStatus: string;
  tokenExpiresAt: string | null;
  latestError: string | null;
};

const categoryIcons = {
  school: GraduationCap,
  communication: Inbox,
  documents: FileSearch,
  calendar: CalendarClock,
  capture: Globe,
};

function usageTotal(provider: ProviderStatus) {
  return (
    provider.usage.assignments +
    provider.usage.documents +
    provider.usage.calendarEvents +
    provider.usage.reviewItems
  );
}

export function AutomationPageContent() {
  const [overview, setOverview] = useState<AutomationOverview | null>(null);
  const [googleStatus, setGoogleStatus] = useState<GoogleCalendarStatus | null>(null);
  const [classroomStatus, setClassroomStatus] = useState<IntegrationStatus | null>(null);
  const [brightspaceStatus, setBrightspaceStatus] = useState<IntegrationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [googleLoading, setGoogleLoading] = useState(true);
  const [classroomLoading, setClassroomLoading] = useState(true);
  const [brightspaceLoading, setBrightspaceLoading] = useState(true);
  const [updatingProvider, setUpdatingProvider] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [classroomBusy, setClassroomBusy] = useState(false);
  const [brightspaceBusy, setBrightspaceBusy] = useState(false);
  const [error, setError] = useState("");

  const loadOverview = useCallback(async () => {
    setError("");

    try {
      const res = await fetch("/api/integrations/permissions");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Integration overview failed to load.");
      }

      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Integration overview failed to load.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadGoogleStatus = useCallback(async () => {
    setGoogleLoading(true);

    try {
      const res = await fetch("/api/integrations/google/calendar/status");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Google Calendar status failed to load.");
      }

      setGoogleStatus(data);
    } catch (err) {
      setGoogleStatus(null);
      setError(err instanceof Error ? err.message : "Google Calendar status failed to load.");
    } finally {
      setGoogleLoading(false);
    }
  }, []);

  const loadClassroomStatus = useCallback(async () => {
    setClassroomLoading(true);

    try {
      const res = await fetch("/api/integrations/google/classroom/status");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Google Classroom status failed to load.");
      }

      setClassroomStatus(data);
    } catch (err) {
      setClassroomStatus(null);
      setError(err instanceof Error ? err.message : "Google Classroom status failed to load.");
    } finally {
      setClassroomLoading(false);
    }
  }, []);

  const loadBrightspaceStatus = useCallback(async () => {
    setBrightspaceLoading(true);

    try {
      const res = await fetch("/api/integrations/brightspace/status");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Brightspace status failed to load.");
      }

      setBrightspaceStatus(data);
    } catch (err) {
      setBrightspaceStatus(null);
      setError(err instanceof Error ? err.message : "Brightspace status failed to load.");
    } finally {
      setBrightspaceLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    void loadGoogleStatus();
  }, [loadGoogleStatus]);

  useEffect(() => {
    void loadClassroomStatus();
  }, [loadClassroomStatus]);

  useEffect(() => {
    void loadBrightspaceStatus();
  }, [loadBrightspaceStatus]);

  const enabledCount = useMemo(
    () => overview?.providers.filter((provider) => provider.permission.enabled).length || 0,
    [overview]
  );
  const activeSourceCount = useMemo(
    () => overview?.providers.filter((provider) => usageTotal(provider) > 0).length || 0,
    [overview]
  );

  async function toggleProvider(provider: ProviderStatus, enabled: boolean) {
    setUpdatingProvider(provider.provider);
    setError("");

    try {
      const res = await fetch("/api/integrations/permissions", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: provider.provider,
          enabled,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Permission update failed.");
      }

      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Permission update failed.");
    } finally {
      setUpdatingProvider(null);
    }
  }

  async function handleGoogleConnect() {
    window.location.assign("/api/integrations/google/oauth/start");
  }

  async function handleGoogleSync() {
    setGoogleBusy(true);
    setError("");

    try {
      const res = await fetch("/api/integrations/google/calendar/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Google Calendar sync failed.");
      }

      await loadGoogleStatus();
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google Calendar sync failed.");
    } finally {
      setGoogleBusy(false);
    }
  }

  async function handleGoogleDisconnect() {
    setGoogleBusy(true);
    setError("");

    try {
      const res = await fetch("/api/integrations/google/oauth/disconnect", {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Google Calendar disconnect failed.");
      }

      await loadGoogleStatus();
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google Calendar disconnect failed.");
    } finally {
      setGoogleBusy(false);
    }
  }

  async function handleClassroomSync() {
    setClassroomBusy(true);
    setError("");

    try {
      const res = await fetch("/api/integrations/google/classroom/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Google Classroom sync failed.");
      }

      await loadClassroomStatus();
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google Classroom sync failed.");
    } finally {
      setClassroomBusy(false);
    }
  }

  async function handleBrightspaceConnect() {
    window.location.assign("/api/integrations/brightspace/oauth/start");
  }

  async function handleBrightspaceSync() {
    setBrightspaceBusy(true);
    setError("");

    try {
      const res = await fetch("/api/integrations/brightspace/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Brightspace sync failed.");
      }

      await loadBrightspaceStatus();
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Brightspace sync failed.");
    } finally {
      setBrightspaceBusy(false);
    }
  }

  async function handleBrightspaceDisconnect() {
    setBrightspaceBusy(true);
    setError("");

    try {
      const res = await fetch("/api/integrations/brightspace/oauth/disconnect", {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Brightspace disconnect failed.");
      }

      await loadBrightspaceStatus();
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Brightspace disconnect failed.");
    } finally {
      setBrightspaceBusy(false);
    }
  }

  if (isLoading) return <LoadingScreen />;

  return (
    <>
      <Header
        title="Integrations"
        description="Bring school information into AcademicOS and let the app distribute it where it belongs."
        action={
          <Button variant="secondary" onClick={loadOverview}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <main className="space-y-6 p-6">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="font-semibold">Google Calendar</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Import calendar events into AcademicOS. Export stays optional and off by default.
              </p>
            </div>
            <Badge variant={googleStatus?.connected ? "success" : "default"}>
              {googleStatus?.connected ? "Connected" : "Disconnected"}
            </Badge>
          </div>

          <div className="grid gap-4 p-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Account</p>
                <p className="mt-2 font-medium">
                  {googleLoading
                    ? "Loading..."
                    : googleStatus?.accountEmail || "No Google account connected"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Token status: {googleStatus?.tokenExpiryStatus || "disconnected"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Scopes</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {googleStatus?.grantedScopes.length ? googleStatus.grantedScopes.join(", ") : "No granted scopes yet"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Last import</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {googleStatus?.lastSyncAt || "No import yet"}
                </p>
              </div>
              {googleStatus?.latestError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {googleStatus.latestError}
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              <Button onClick={handleGoogleConnect} disabled={googleBusy}>
                <PlugZap className="h-4 w-4" />
                Connect
              </Button>
              <Button variant="secondary" onClick={handleGoogleSync} disabled={googleBusy || !googleStatus?.connected}>
                <RefreshCw className="h-4 w-4" />
                Import now
              </Button>
              <Button variant="secondary" onClick={handleGoogleDisconnect} disabled={googleBusy || !googleStatus?.connected}>
                <Unplug className="h-4 w-4" />
                Disconnect
              </Button>
              <p className="text-xs text-muted-foreground">
                Google Calendar is the first import source. The app can read it without relying on it for output.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h2 className="font-semibold">Google Classroom</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Import coursework and announcements from your Google Classroom classes.
                </p>
              </div>
              <Badge variant={classroomStatus?.connected ? "success" : "default"}>
                {classroomStatus?.connected ? "Connected" : "Disconnected"}
              </Badge>
            </div>

            <div className="space-y-3 p-5">
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Account</p>
                <p className="mt-2 font-medium">
                  {classroomLoading ? "Loading..." : classroomStatus?.accountEmail || "No Google account connected"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Token status: {classroomStatus?.tokenExpiryStatus || "disconnected"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Last import</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {classroomStatus?.lastSyncAt || "No import yet"}
                </p>
              </div>
              {classroomStatus?.latestError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {classroomStatus.latestError}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleGoogleConnect} disabled={googleBusy}>
                  <PlugZap className="h-4 w-4" />
                  Connect Google
                </Button>
                <Button variant="secondary" onClick={handleClassroomSync} disabled={classroomBusy || !classroomStatus?.connected}>
                  <RefreshCw className="h-4 w-4" />
                  Import now
                </Button>
                <Button variant="secondary" onClick={handleGoogleDisconnect} disabled={googleBusy || !classroomStatus?.connected}>
                  <Unplug className="h-4 w-4" />
                  Disconnect Google
                </Button>
              </div>
            </div>
          </article>

          <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h2 className="font-semibold">D2L / Brightspace</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Import course news and deadline signals from Brightspace.
                </p>
              </div>
              <Badge variant={brightspaceStatus?.connected ? "success" : "default"}>
                {brightspaceStatus?.connected ? "Connected" : "Disconnected"}
              </Badge>
            </div>

            <div className="space-y-3 p-5">
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Account</p>
                <p className="mt-2 font-medium">
                  {brightspaceLoading
                    ? "Loading..."
                    : brightspaceStatus?.accountName || brightspaceStatus?.accountEmail || "No Brightspace account connected"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Token status: {brightspaceStatus?.tokenExpiryStatus || "disconnected"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Last import</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {brightspaceStatus?.lastSyncAt || "No import yet"}
                </p>
              </div>
              {brightspaceStatus?.latestError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {brightspaceStatus.latestError}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleBrightspaceConnect} disabled={brightspaceBusy}>
                  <PlugZap className="h-4 w-4" />
                  Connect
                </Button>
                <Button variant="secondary" onClick={handleBrightspaceSync} disabled={brightspaceBusy || !brightspaceStatus?.connected}>
                  <RefreshCw className="h-4 w-4" />
                  Import now
                </Button>
                <Button variant="secondary" onClick={handleBrightspaceDisconnect} disabled={brightspaceBusy || !brightspaceStatus?.connected}>
                  <Unplug className="h-4 w-4" />
                  Disconnect
                </Button>
              </div>
            </div>
          </article>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Enabled Sources",
              value: String(enabledCount),
              detail: `${overview?.providers.length || 0} available connectors`,
              icon: ShieldCheck,
            },
            {
              label: "Active Sources",
              value: String(activeSourceCount),
              detail: "Sources with imported academic data",
              icon: Database,
            },
            {
              label: "Needs Review",
              value: String(overview?.reviewItems || 0),
              detail: "Uncertain findings awaiting approval",
              icon: BookOpenCheck,
            },
            {
              label: "AI Signals",
              value: String(overview?.signals.length || 0),
              detail: "Deadline, overload, and study alerts",
              icon: Brain,
            },
          ].map((stat) => {
            const Icon = stat.icon;

            return (
              <article key={stat.label} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-muted">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <p className="mt-4 text-2xl font-semibold tracking-tight">{stat.value}</p>
                <p className="text-sm font-medium">{stat.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{stat.detail}</p>
              </article>
            );
          })}
        </section>

        <section className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="font-semibold">Integration Permissions</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Enable only the sources AcademicOS is allowed to use.
              </p>
            </div>
            <Badge variant="accent">Permission based</Badge>
          </div>

          <div className="divide-y divide-border">
            {automationCategories.map((category) => {
              const providers =
                overview?.providers.filter((provider) => provider.category === category.id) || [];
              const CategoryIcon = categoryIcons[category.id] || Sparkles;

              if (!providers.length) return null;

              return (
                <div key={category.id} className="px-5 py-5">
                  <div className="mb-4 flex items-center gap-2">
                    <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">{category.label}</h3>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    {providers.map((provider) => {
                      const isEnabled = provider.permission.enabled;
                      const totalUsage = usageTotal(provider);

                      return (
                        <article
                          key={provider.provider}
                          className="rounded-lg border border-border bg-background p-4"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="font-medium">{provider.label}</h4>
                                <Badge variant={provider.status === "available" ? "success" : "default"}>
                                  {provider.status === "available" ? "Available" : "Planned"}
                                </Badge>
                              </div>
                              <p className="mt-2 text-sm text-muted-foreground">
                                {provider.description}
                              </p>
                            </div>
                            <Toggle
                              checked={isEnabled}
                              onChange={(checked) => toggleProvider(provider, checked)}
                              label={`${isEnabled ? "Disable" : "Enable"} ${provider.label}`}
                            />
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div>
                              <p className="text-xs font-medium uppercase text-muted-foreground">
                                Allowed Access
                              </p>
                              <p className="mt-1 text-sm">
                                {isEnabled ? provider.permission.scopes.join(", ") : "No access"}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-medium uppercase text-muted-foreground">
                                Imported Items
                              </p>
                              <p className="mt-1 text-sm">{totalUsage}</p>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {provider.capabilities.map((capability) => (
                              <span
                                key={capability}
                                className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                              >
                                {capability}
                              </span>
                            ))}
                          </div>

                          {updatingProvider === provider.provider ? (
                            <p className="mt-3 text-xs text-muted-foreground">Updating access...</p>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-semibold">Intelligence Pipeline</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                How AcademicOS handles incoming academic information.
              </p>
            </div>
            <div className="grid gap-3 p-5">
              {[
                "Collect from approved sources",
                "Extract assignments, dates, documents, grades, and announcements",
                "Score confidence and ask before applying uncertain findings",
                "Place imported time into Calendar and Mission without duplicates",
                "Create daily briefings, deadline warnings, and study recommendations",
              ].map((step, index) => (
                <div key={step} className="flex gap-3 rounded-lg border border-border bg-background p-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-muted text-xs font-semibold text-accent">
                    {index + 1}
                  </div>
                  <p className="text-sm">{step}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-semibold">Privacy Guardrails</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Student data stays governed by explicit access choices.
              </p>
            </div>
            <div className="space-y-4 p-5">
              {[
                {
                  title: "User-controlled access",
                  body: "Every connector can be enabled or disabled independently.",
                },
                {
                  title: "Confidence before action",
                  body: "Uncertain findings go to review before becoming assignments or events.",
                },
                {
                  title: "Transparent sources",
                  body: "Imported academic items keep provider, URL, confidence, and sync metadata.",
                },
              ].map((item) => (
                <div key={item.title} className="flex gap-3">
                  <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>
      </main>
    </>
  );
}
