"use client";

import { useActionState, useCallback, useEffect, useState, useTransition } from "react";
import { AlertCircle, RotateCw, Trash2, UserPlus, Users } from "lucide-react";

import { SubmitButton } from "@/components/auth/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getTeamDataAction,
  inviteTeamMemberAction,
  removeMemberAction,
  revokeInviteAction,
  updateMemberRoleAction,
  type TeamMemberView,
  type PendingInviteView,
} from "@/lib/actions/team";
import type { ActionResult } from "@/types";
import type { ClinicRole } from "@/types/database";

const ROLE_LABELS: Record<ClinicRole, string> = {
  owner: "Owner",
  admin: "Admin",
  staff: "Staff",
};

type TeamData = {
  members: TeamMemberView[];
  pendingInvites: PendingInviteView[];
  viewerRole: ClinicRole;
  isAdmin: boolean;
};

export function TeamManager({ viewerRole }: { viewerRole: ClinicRole }) {
  const [data, setData] = useState<TeamData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await getTeamDataAction();
    if (result.ok) {
      setData(result.data);
    } else {
      setLoadError(result.message || "We couldn't load your team. Please try again.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <TeamSkeleton />;

  if (loadError || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{loadError ?? "We couldn't load your team."}</AlertDescription>
          </Alert>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void load()}>
            <RotateCw aria-hidden="true" />
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isAdmin = data.isAdmin;

  return (
    <div className="space-y-6">
      {isAdmin ? <InviteForm onInvited={load} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            {isAdmin
              ? "Change roles or remove teammates. Only the owner can manage owners."
              : "Everyone working in this clinic."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {data.members.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No members yet"
              description="Invite your first teammate so they can help manage this clinic."
            />
          ) : (
            data.members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                viewerRole={viewerRole}
                isOnlyOwner={countOwners(data.members) === 1 && member.role === "owner"}
                onChanged={load}
              />
            ))
          )}
        </CardContent>
      </Card>

      {isAdmin ? <PendingInvites invites={data.pendingInvites} onChanged={load} /> : null}
    </div>
  );
}

function countOwners(members: TeamMemberView[]): number {
  return members.filter((member) => member.role === "owner").length;
}

function MemberRow({
  member,
  viewerRole,
  isOnlyOwner,
  onChanged,
}: {
  member: TeamMemberView;
  viewerRole: ClinicRole;
  isOnlyOwner: boolean;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const canManage = viewerRole === "owner" || viewerRole === "admin";
  const targetIsOwner = member.role === "owner";
  // Admins can't manage owners; nobody edits the last owner; only the owner
  // may see or grant the owner role. (The server re-checks all of this.)
  const roleEditable =
    canManage && !isOnlyOwner && !(viewerRole === "admin" && targetIsOwner);
  const roleOptions: ClinicRole[] =
    viewerRole === "owner" ? ["owner", "admin", "staff"] : ["admin", "staff"];
  const removable = canManage && !isOnlyOwner && !(viewerRole === "admin" && targetIsOwner);

  const changeRole = (role: string) => {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("memberId", member.id);
      formData.set("role", role);
      const result = await updateMemberRoleAction(null, formData);
      if (!result.ok) setError(result.message);
      onChanged();
    });
  };

  const remove = () => {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("memberId", member.id);
      const result = await removeMemberAction(null, formData);
      if (!result.ok) setError(result.message);
      onChanged();
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-text-muted/20 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{member.email}</p>
        <p className="text-xs text-text-muted">
          Joined{" "}
          {new Date(member.joinedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex shrink-0 items-center gap-2">
        {roleEditable ? (
          <NativeSelect
            aria-label={`Role for ${member.email}`}
            value={member.role}
            onChange={(event) => changeRole(event.target.value)}
            disabled={pending}
            className="w-28"
          >
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <Badge>{ROLE_LABELS[member.role]}</Badge>
        )}

        {removable ? (
          confirmingRemove ? (
            <span className="flex items-center gap-1">
              <Button
                variant="destructive"
                size="sm"
                onClick={remove}
                disabled={pending}
              >
                {pending ? "Removing…" : "Confirm"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingRemove(false)}
                disabled={pending}
              >
                Cancel
              </Button>
            </span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Remove ${member.email}`}
              onClick={() => setConfirmingRemove(true)}
              disabled={pending}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}

function InviteForm({ onInvited }: { onInvited: () => void }) {
  const [state, formAction] = useActionState<ActionResult<string> | null, FormData>(
    inviteTeamMemberAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) onInvited();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run when a submit completes
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite a teammate</CardTitle>
        <CardDescription>
          They&apos;ll receive an email invitation valid for 7 days.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} noValidate className="space-y-4">
          {state && !state.ok ? (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}

          {state?.ok ? (
            <Alert>
              <UserPlus aria-hidden="true" />
              <AlertDescription>
                Invitation sent to {state.data}. They&apos;ll appear here once they accept.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email address</Label>
              <Input
                id="invite-email"
                name="email"
                type="email"
                placeholder="teammate@clinic.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <NativeSelect id="invite-role" name="role" defaultValue="staff">
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </NativeSelect>
            </div>
            <SubmitButton>Send invite</SubmitButton>
          </div>

          <p className="text-xs text-text-muted">
            Staff manage appointments and patients. Admins also manage services,
            availability, AI settings, and the website. Only you can manage owners.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

function PendingInvites({
  invites,
  onChanged,
}: {
  invites: PendingInviteView[];
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();

  const revoke = (inviteId: string) => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("inviteId", inviteId);
      await revokeInviteAction(null, formData);
      onChanged();
    });
  };

  if (invites.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending invitations</CardTitle>
        <CardDescription>Waiting for these teammates to accept.</CardDescription>
      </CardHeader>
      <CardContent>
        {invites.map((invite) => (
          <div
            key={invite.id}
            className="flex items-center justify-between gap-3 border-b border-text-muted/20 py-3 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text-primary">{invite.email}</p>
              <p className="text-xs text-text-muted">
                {ROLE_LABELS[invite.role]} · expires{" "}
                {new Date(invite.expiresAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => revoke(invite.id)}
              disabled={pending}
            >
              Revoke
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TeamSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <Skeleton className="h-44 w-full rounded-card" />
      <Skeleton className="h-40 w-full rounded-card" />
    </div>
  );
}
