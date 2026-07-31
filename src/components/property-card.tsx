"use client";

import { useState, useTransition } from "react";
import {
  castVote,
  removeVote,
  castVeto,
  addComment,
  deleteComment,
} from "@/actions/votes";
import {
  updatePropertyStatus,
  updateProperty,
  deleteProperty,
} from "@/actions/properties";
import { StarRating, StarDisplay } from "@/components/star-rating";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getPropertyStats } from "@/lib/sort-properties";
import { formatPrice, formatDistance, cn } from "@/lib/utils";
import {
  ExternalLink,
  Ban,
  Trash2,
  MessageCircle,
  CheckCircle2,
  CheckCircle,
  XCircle,
  Pencil,
  MapPin,
  Award,
  Users,
  Home,
  Shield,
  Star,
  ChevronDown,
  ChevronUp,
  Settings,
  ChevronRight,
  HelpCircle,
} from "lucide-react";
import type { Property, ParticipantRole, Profile } from "@/lib/types";

interface PropertyCardProps {
  property: Property;
  vacationId: string;
  inviteCode: string;
  userId: string | null;
  userRole: ParticipantRole | null;
  participantCount: number;
  allVetoes: { property_id: string; user_id: string }[];
  userProfile?: Profile | null;
}

const statusConfig = {
  active: { label: "Aktiv", variant: "default" as const },
  eliminated: { label: "Ausgeschieden", variant: "danger" as const },
  booked: { label: "Gebucht", variant: "success" as const },
};

type DetailTab = "voting" | "vetos" | "comments" | "owner" | "edit";

function DetailPanel({
  activeTab,
  onTabChange,
  children,
}: {
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  children: React.ReactNode;
}) {
  const tabs: { id: DetailTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: "voting", label: "Voting", icon: <Users className="h-3.5 w-3.5" /> },
    { id: "vetos", label: "Vetos", icon: <Shield className="h-3.5 w-3.5" /> },
    { id: "comments", label: "Kommentare", icon: <MessageCircle className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      {/* Tab Bar */}
      <div className="flex border-b border-slate-200 bg-slate-50 px-1 py-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors",
              activeTab === tab.id
                ? "bg-white text-teal-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            )}
          >
            <span className={cn(activeTab === tab.id ? "text-teal-600" : "text-slate-400")}>
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-3">{children}</div>
    </div>
  );
}

interface OverallRatingOverlayProps {
  averageStars: number;
  voteCount: number;
}

function OverallRatingOverlay({ averageStars, voteCount }: OverallRatingOverlayProps) {
  const hasVotes = voteCount > 0;

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
      <div className="flex flex-col items-center gap-1.5">
        {/* Blurred background container */}
        <div className="relative">
          <div className="absolute inset-0 bg-white/90 backdrop-blur-md rounded-xl shadow-lg" />
          <div className="relative px-3 py-2.5">
            <span className="text-xl font-bold text-amber-600">
              {hasVotes ? averageStars.toFixed(1) : "–"}
            </span>
            <span className="text-slate-500 text-sm ml-1">/ 5</span>
          </div>
        </div>
        {/*
        {hasVotes && (
          <span className="text-xs text-slate-500 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-md">
            {voteCount} {voteCount === 1 ? "Stimme" : "Stimmen"}
          </span>
        )}
        */}
      </div>
    </div>
  );
}

function VotingTabContent({ stats, property, userId, pending, onVoteChange }: {
  stats: ReturnType<typeof getPropertyStats>;
  property: Property;
  userId: string | null;
  pending: boolean;
  onVoteChange: (stars: number) => void;
}) {
  const { voteCount, averageStars, distribution } = stats;
  const hasVotes = voteCount > 0;

  // Get votes with profile info from property
  const votes = property.votes ?? [];

  return (
    <div className="space-y-3">
      {/* Overall Rating Summary */}
      <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-amber-500">
            {hasVotes ? averageStars.toFixed(1) : "–"}
          </span>
          <span className="text-slate-500">/ 5</span>
        </div>

        <span className="text-sm text-slate-500">
          {voteCount} {voteCount === 1 ? "Stimme" : "Stimmen"}
        </span>

      </div>

      {/* Distribution bars 
      <div className="space-y-1.5">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = distribution?.[star] ?? 0;
          const percentage = voteCount > 0 ? (count / voteCount) * 100 : 0;
          return (
            <div key={star} className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 w-5 text-right">{star}★</span>
              <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 rounded-full transition-all duration-300"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="text-slate-500 w-8 text-right">{count}</span>
            </div>
          );
        })}
      </div>*/}

      {/* Individual votes with names */}
      {votes.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-200">
          <h5 className="text-xs font-medium text-slate-600">Einzelne Stimmen:</h5>
          <div className="space-y-1.5">
            {votes
              .slice()
              .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
              .map((vote) => (
                <div
                  key={vote.user_id}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="font-medium text-slate-900 truncate w-32">
                    {vote.profile?.name ?? "Unbekannt"}
                  </span>
                  <StarDisplay
                    stars={vote.stars ?? 0}
                    size="sm"
                    className="text-amber-400 flex-shrink-0"
                  />
                  <span className="text-slate-500 w-12 text-right">
                    {vote.stars}/5
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      <Separator className="my-2" />

      {/* Note: Personal vote is shown in the card summary above */}
    </div>
  );
}

function VetosTabContent({ stats, userId, pending, onVeto }: {
  stats: ReturnType<typeof getPropertyStats>;
  userId: string | null;
  pending: boolean;
  onVeto: () => void;
}) {
  return (
    <div className="space-y-2">
      <Button
        variant={stats.userVeto ? "destructive" : "outline"}
        size="sm"
        onClick={onVeto}
        disabled={!userId || pending}
        className="w-full"
      >
        <Ban className="h-3.5 w-3.5 mr-1.5" />
        {stats.userVeto ? "Veto zurücknehmen" : "Veto einlegen"}
        {stats.vetoCount > 0 && !stats.userVeto && ` (${stats.vetoCount})`}
      </Button>
      {stats.vetoCount > 0 && !stats.userVeto && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <Shield className="h-3 w-3" />
          {stats.vetoCount} Veto{stats.vetoCount > 1 ? "s" : ""} – kann nicht gebucht werden
        </p>
      )}
      {stats.vetoCount === 0 && (
        <p className="text-xs text-slate-400 text-center py-2">Noch keine Vetos</p>
      )}
    </div>
  );
}

function CommentsTabContent({
  property,
  userId,
  inviteCode,
  commentText,
  setCommentText,
  pending,
  onComment,
  onDeleteComment,
}: {
  property: Property;
  userId: string | null;
  inviteCode: string;
  commentText: string;
  setCommentText: (text: string) => void;
  pending: boolean;
  onComment: (e: React.FormEvent) => void;
  onDeleteComment: (commentId: string) => void;
}) {
  const comments = property.comments ?? [];

  return (
    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
      {comments.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-3">Keine Kommentare</p>
      ) : (
        comments.map((comment) => (
          <div key={comment.id} className="rounded-lg bg-slate-50 p-2.5 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-medium text-slate-900 truncate">
                  {comment.profile?.name ?? "Unbekannt"}
                </span>
                {comment.stars && <StarDisplay stars={comment.stars} size="sm" />}
              </div>
              {comment.user_id === userId && (
                <button
                  type="button"
                  onClick={() => onDeleteComment(comment.id)}
                  className="text-slate-400 hover:text-red-500 flex-shrink-0 p-0.5"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
            <p className="mt-1 text-slate-600 leading-relaxed">{comment.text}</p>
          </div>
        ))
      )}

      {userId && (
        <form onSubmit={onComment} className="flex gap-1.5 pt-1 border-t border-slate-200">
          <Input
            placeholder="Kommentar..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            className="flex-1 text-xs py-1.5"
          />
          <Button type="submit" size="sm" disabled={pending} className="h-8 px-3">
            Senden
          </Button>
        </form>
      )}
    </div>
  );
}

function OwnerTabContent({ property, pending, onStatusChange }: {
  property: Property;
  pending: boolean;
  onStatusChange: (status: "active" | "eliminated" | "booked") => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {property.status !== "booked" && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onStatusChange("booked")}
          disabled={pending}
        >
          <CheckCircle className="h-3.5 w-3.5 mr-1" />
          Gebucht
        </Button>
      )}
      {property.status !== "eliminated" && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onStatusChange("eliminated")}
          disabled={pending}
        >
          <XCircle className="h-3.5 w-3.5 mr-1" />
          Ausscheiden
        </Button>
      )}
      {property.status !== "active" && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onStatusChange("active")}
          disabled={pending}
        >
          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
          Reaktivieren
        </Button>
      )}
    </div>
  );
}

function EditTabContent({
  property,
  inviteCode,
  editing,
  setEditing,
  editError,
  pending,
  onSave,
  onCancel,
}: {
  property: Property;
  inviteCode: string;
  editing: boolean;
  setEditing: (editing: boolean) => void;
  editError: string | null;
  pending: boolean;
  onSave: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  if (!editing) {
    return (
      <div className="text-center py-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditing(true)}
          disabled={pending}
          className="w-full justify-start"
        >
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          Details bearbeiten
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSave} className="space-y-2.5">
      <div className="space-y-1">
        <Label htmlFor={`title-${property.id}`} className="text-xs">Titel</Label>
        <Input
          id={`title-${property.id}`}
          name="title"
          defaultValue={property.title ?? ""}
          placeholder="Titel"
          className="text-sm"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`address-${property.id}`} className="flex items-center gap-1 text-xs">
          <MapPin className="h-3 w-3" />
          Adresse
        </Label>
        <Input
          id={`address-${property.id}`}
          name="address"
          defaultValue={property.address ?? ""}
          placeholder="Musterstraße 12, 12345 Berlin"
          className="text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`price-${property.id}`} className="text-xs">Preis (€)</Label>
          <Input
            id={`price-${property.id}`}
            name="price"
            type="number"
            min="0"
            step="0.01"
            defaultValue={property.price ?? ""}
            className="text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`bedrooms-${property.id}`} className="text-xs">SZ</Label>
          <Input
            id={`bedrooms-${property.id}`}
            name="bedrooms"
            type="number"
            min="0"
            defaultValue={property.bedrooms ?? ""}
            className="text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`beds-${property.id}`} className="text-xs">Betten</Label>
          <Input
            id={`beds-${property.id}`}
            name="beds"
            type="number"
            min="0"
            defaultValue={property.beds ?? ""}
            className="text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`bathrooms-${property.id}`} className="text-xs">Bad</Label>
          <Input
            id={`bathrooms-${property.id}`}
            name="bathrooms"
            type="number"
            min="0"
            step="0.5"
            defaultValue={property.bathrooms ?? ""}
            className="text-sm"
          />
        </div>
      </div>

      <label className="flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          name="has_pool"
          defaultChecked={property.has_pool}
          className="h-3.5 w-3.5 rounded border-slate-300"
        />
        Pool
      </label>

      {editError && <p className="text-xs text-red-600">{editError}</p>}

      <div className="flex gap-1.5 pt-1">
        <Button type="submit" size="sm" disabled={pending} className="flex-1">
          Speichern
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={pending}
          className="flex-1"
        >
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

function DetailsAccordion({
  property,
  stats,
  userId,
  userRole,
  inviteCode,
  vacationId,
  pending,
  canEdit,
  canDelete,
  commentText,
  setCommentText,
  editing,
  setEditing,
  editError,
  onVoteChange,
  onVeto,
  onComment,
  onDeleteComment,
  onStatusChange,
  onSaveEdit,
  onCancelEdit,
}: {
  property: Property;
  stats: ReturnType<typeof getPropertyStats>;
  userId: string | null;
  userRole: ParticipantRole | null;
  inviteCode: string;
  vacationId: string;
  pending: boolean;
  canEdit: boolean;
  canDelete: boolean;
  commentText: string;
  setCommentText: (text: string) => void;
  editing: boolean;
  setEditing: (editing: boolean) => void;
  editError: string | null;
  onVoteChange: (stars: number) => void;
  onVeto: () => void;
  onComment: (e: React.FormEvent) => void;
  onDeleteComment: (commentId: string) => void;
  onStatusChange: (status: "active" | "eliminated" | "booked") => void;
  onSaveEdit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancelEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>("voting");

  // Determine available tabs
  const availableTabs: DetailTab[] = ["voting", "vetos", "comments"];
  if (userRole === "owner") availableTabs.push("owner");
  if ((canEdit || canDelete) && userRole !== "owner") availableTabs.push("edit");

  // Auto-switch to first available tab if current not available
  if (!availableTabs.includes(activeTab)) {
    setActiveTab(availableTabs[0]);
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      {/* Accordion Header */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-2.5 bg-slate-50 hover:bg-slate-100 text-left"
      >
        <span className="flex items-center gap-2 text-slate-500">
          <ChevronRight className={cn("h-4 w-4 transition-transform", open && "rotate-90")} />
        </span>
        <span className="font-medium text-slate-900 text-sm flex-1 text-center">Details</span>
        <span className="w-5" /> {/* spacer for alignment */}
      </button>

      {open && (
        <div className="border-t border-slate-200">
          {/* Tab Bar */}
          <div className="flex border-b border-slate-200 bg-slate-50 px-1 py-1 overflow-x-auto">
            {availableTabs.map((tab) => {
              const tabInfo = {
                voting: { label: "Voting", icon: <Users className="h-3.5 w-3.5" /> },
                vetos: { label: "Vetos", icon: <Shield className="h-3.5 w-3.5" /> },
                comments: { label: "Kommentare", icon: <MessageCircle className="h-3.5 w-3.5" /> },
                owner: { label: "Owner", icon: <Settings className="h-3.5 w-3.5" /> },
                edit: { label: "Bearbeiten", icon: <Pencil className="h-3.5 w-3.5" /> },
              }[tab];
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap",
                    activeTab === tab
                      ? "bg-white text-teal-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                  )}
                >
                  <span className={cn(activeTab === tab ? "text-teal-600" : "text-slate-400")}>
                    {tabInfo.icon}
                  </span>
                  <span>{tabInfo.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="p-3">
            {activeTab === "voting" && (
              <VotingTabContent
                stats={stats}
                property={property}
                userId={userId}
                pending={pending}
                onVoteChange={onVoteChange}
              />
            )}
            {activeTab === "vetos" && (
              <VetosTabContent
                stats={stats}
                userId={userId}
                pending={pending}
                onVeto={onVeto}
              />
            )}
            {activeTab === "comments" && (
              <CommentsTabContent
                property={property}
                userId={userId}
                inviteCode={inviteCode}
                commentText={commentText}
                setCommentText={setCommentText}
                pending={pending}
                onComment={onComment}
                onDeleteComment={onDeleteComment}
              />
            )}
            {activeTab === "owner" && userRole === "owner" && (
              <OwnerTabContent
                property={property}
                pending={pending}
                onStatusChange={onStatusChange}
              />
            )}
            {activeTab === "edit" && ((canEdit || canDelete) && userRole !== "owner") && (
              <EditTabContent
                property={property}
                inviteCode={inviteCode}
                editing={editing}
                setEditing={setEditing}
                editError={editError}
                pending={pending}
                onSave={onSaveEdit}
                onCancel={onCancelEdit}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function PropertyCard({
  property,
  vacationId,
  inviteCode,
  userId,
  userRole,
  participantCount,
  allVetoes,
  userProfile,
}: PropertyCardProps) {
  const [pending, startTransition] = useTransition();
  const [commentText, setCommentText] = useState("");
  const [editing, setEditing] = useState(false);
  const [editingVote, setEditingVote] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const stats = getPropertyStats(property, userId ?? undefined, allVetoes, userProfile);
  const status = statusConfig[property.status];
  const pricePerPerson =
    property.price && participantCount > 0
      ? property.price / participantCount
      : null;

  const hasVetoes = stats.vetoCount > 0;

  const canDelete =
    userRole === "owner" || property.suggested_by === userId;
  const canEdit = userRole !== null;

  function handleVote(stars: number) {
    if (!userId) return;
    startTransition(async () => {
      if (stats.userVote === stars) {
        await removeVote(property.id, inviteCode);
      } else {
        await castVote(property.id, vacationId, inviteCode, stars);
      }
    });
  }

  function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setEditError(null);
    startTransition(async () => {
      const result = await updateProperty(property.id, inviteCode, formData);
      if (result?.error) {
        setEditError(result.error);
      } else {
        setEditing(false);
      }
    });
  }

  function handleVeto() {
    if (!userId) return;
    startTransition(async () => {
      await castVeto(property.id, vacationId, inviteCode);
    });
  }

  function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentText.trim()) return;
    startTransition(async () => {
      await addComment(property.id, inviteCode, commentText, stats.userVote);
      setCommentText("");
    });
  }

  function handleDeleteComment(commentId: string) {
    startTransition(async () => {
      await deleteComment(commentId, inviteCode);
    });
  }

  function handleStatus(status: "active" | "eliminated" | "booked") {
    startTransition(async () => {
      await updatePropertyStatus(property.id, inviteCode, status);
    });
  }

  function handleDelete() {
    if (!confirm("Haus wirklich löschen?")) return;
    startTransition(async () => {
      await deleteProperty(property.id, inviteCode);
    });
  }

  return (
    <Card
      className={cn(
        "overflow-hidden transition-opacity relative",
        property.status === "eliminated" && "opacity-60",
        property.status === "booked" && "ring-2 ring-emerald-500",
        // Highlight if user hasn't voted yet
        userId && stats.userVote === null && "ring-2 ring-amber-400 bg-amber-50/30"
      )}
    >
      {/* Bold "To Vote" indicator bar on right side */}
      {userId && stats.userVote === null && (
        <div className="absolute right-0 top-0 bottom-0 w-2 bg-amber-400 rounded-r-xl" title="Noch nicht bewertet" />
      )}
      <div className="flex flex-col sm:flex-row">
        {/* Image Column */}
        <div className="relative h-40 w-full shrink-0 sm:h-auto sm:w-48">
          {property.image_url ? (
            <img
              src={property.image_url}
              alt={property.title ?? "Ferienhaus"}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
              Kein Bild
            </div>
          )}

          {/* Overall Rating Overlay on Image */}
          {userId && (
            <OverallRatingOverlay
              averageStars={stats.averageStars}
              voteCount={stats.voteCount}
            />
          )}

          {/* Status badge on image */}
          <div className="absolute top-2 right-2">
            <Badge variant={status.variant} className="px-2 py-1 text-xs">
              {status.label}
            </Badge>
          </div>
        </div>

        {/* Content Column */}
        <CardContent className="flex flex-1 flex-col gap-2.5 p-3">
          {/* Header: Title + External Link */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900 truncate text-base">
                {property.title ?? "Unbenanntes Haus"}
              </h3>
              {property.provider && (
                <p className="text-xs text-slate-500 mt-0.5">{property.provider}</p>
              )}
            </div>
            <a
              href={property.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-teal-600 hover:text-teal-700 p-1"
            >
              <ExternalLink className="h-4.5 w-4.5" />
            </a>
          </div>

          {/* MAIN INFO - Always visible: Attributes + Voting Result */}
          <div className="space-y-2.5">
            {/* Attributes Grid - more compact */}
            <div className="grid grid-cols-4 gap-1.5 text-[10px]">
              {property.price != null && (
                <div className="flex flex-col items-center gap-0.5 p-1.5 rounded bg-slate-50">
                  <span className="text-slate-400">Gesamt</span>
                  <span className="font-semibold text-slate-900">{formatPrice(property.price)}</span>
                </div>
              )}
              {pricePerPerson != null && (
                <div className="flex flex-col items-center gap-0.5 p-1.5 rounded bg-slate-50">
                  <span className="text-slate-400">/ Pers.</span>
                  <span className="font-semibold text-slate-900">{formatPrice(pricePerPerson)}</span>
                </div>
              )}
              {property.bedrooms != null && (
                <div className="flex flex-col items-center gap-0.5 p-1.5 rounded bg-slate-50">
                  <Home className="h-3.5 w-3.5 text-slate-400" />
                  <span className="font-semibold text-slate-900">{property.bedrooms} SZ</span>
                </div>
              )}
              {property.beds != null && (
                <div className="flex flex-col items-center gap-0.5 p-1.5 rounded bg-slate-50">
                  <span className="text-slate-400 text-[10px]">🛏️</span>
                  <span className="font-semibold text-slate-900">{property.beds} Betten</span>
                </div>
              )}
              {property.bathrooms != null && (
                <div className="flex flex-col items-center gap-0.5 p-1.5 rounded bg-slate-50">
                  <span className="text-slate-400 text-[10px]">🛁</span>
                  <span className="font-semibold text-slate-900">{property.bathrooms} Bad</span>
                </div>
              )}
              {property.has_pool && (
                <div className="flex flex-col items-center gap-0.5 p-1.5 rounded bg-slate-50">
                  <span className="text-slate-400 text-[10px]">🏊</span>
                  <span className="font-semibold text-slate-900">Pool</span>
                </div>
              )}
              {/* Distance from home - show distance or question mark if not set */}
              <button
                type="button"
                className={cn(
                  "flex flex-col items-center gap-0.5 p-1.5 rounded transition-all duration-150",
                  stats.distanceFromHome != null
                    ? "bg-blue-50 hover:bg-blue-100 hover:scale-[1.05] cursor-pointer text-blue-700"
                    : "bg-slate-50 hover:bg-slate-100 hover:scale-[1.05] cursor-pointer text-slate-400"
                )}
                title={
                  stats.distanceFromHome != null
                    ? "Klicke für Info zur Berechnung"
                    : "Heimatadresse nicht gesetzt – klicke für Info"
                }
                onClick={() => {
                  if (stats.distanceFromHome == null) {
                    alert(
                      "Deine Heimatadresse ist noch nicht gesetzt.\n\n" +
                        "Gehe zu Einstellungen (oben rechts im Menü) und trage deine Adresse ein.\n" +
                        "Wir speichern nur die Koordinaten, nicht die Adresse selbst."
                    );
                  } else {
                    alert(
                      `Entfernung: ${formatDistance(stats.distanceFromHome)}\n\n` +
                        "Dies ist die Luftlinie (gerade Distanz) zwischen deinem Zuhause und dem Ferienhaus.\n" +
                        "Keine Fahrstrecke oder Flugroute – nur die direkte Entfernung."
                    );
                  }
                }}
              >
                {stats.distanceFromHome != null ? (
                  <>
                    <MapPin className="h-3.5 w-3.5 text-blue-500" />
                    <span className="font-semibold text-blue-700 text-[10px]">
                      {formatDistance(stats.distanceFromHome)}
                    </span>
                  </>
                ) : (
                  <>
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-semibold text-slate-400 text-[10px]">—</span>
                    <span className="text-[8px] text-slate-500 uppercase tracking-wider">
                      klicken
                    </span>
                  </>
                )}
              </button>
            </div>

            <Separator className="my-1" />

            {/* Personal vote display - interactive in card summary */}
            {userId && (
              <div className="flex items-center justify-between gap-3 p-2 rounded-lg bg-teal-50">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-teal-700">Deine Bewertung:</span>
                  {!editingVote ? (
                    <div className="flex items-center gap-1.5">
                      {stats.userVote === null ? (
                        <StarDisplay stars={0} size="sm" className="text-slate-300" />
                      ) : (
                        <>
                          <StarDisplay
                            stars={stats.userVote}
                            size="sm"
                            className="text-teal-400"
                          />
                          <span className="text-sm font-medium text-teal-600">
                            {stats.userVote}/5
                          </span>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditingVote(true)}
                        disabled={pending || stats.userVote === null}
                        className={cn(
                          "p-0.5 rounded transition-colors",
                          stats.userVote !== null
                            ? "text-teal-400 hover:text-teal-600"
                            : "text-slate-300 cursor-not-allowed"
                        )}
                        aria-label={stats.userVote !== null ? "Bewertung ändern" : ""}
                        title={stats.userVote !== null ? "Bewertung ändern" : "Erst bewerten"}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <StarRating
                        value={stats.userVote}
                        onChange={(stars) => {
                          handleVote(stars);
                          setEditingVote(false);
                        }}
                        disabled={pending}
                        size="sm"
                        outlined
                      />
                      <button
                        type="button"
                        onClick={() => setEditingVote(false)}
                        disabled={pending}
                        className="p-0.5 text-slate-400 hover:text-slate-600 transition-colors"
                        aria-label="Abbrechen"
                        title="Abbrechen"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                {!editingVote && stats.userVote === null && !pending && (
                  <span className="text-xs text-teal-500 font-medium">Klicke zum Bewerten</span>
                )}
              </div>
            )}

            {/* Veto status only - overall rating is on image */}
            {hasVetoes && (
              <div className="flex justify-end">
                <span className="flex items-center gap-1 text-[10px] text-red-600 bg-red-50 px-2 py-1 rounded">
                  <Shield className="h-2.5 w-2.5" />
                  {stats.vetoCount} Veto{stats.vetoCount > 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>

          {/* SINGLE ACCORDION FOR ALL DETAILS */}
          <DetailsAccordion
            property={property}
            stats={stats}
            userId={userId}
            userRole={userRole}
            inviteCode={inviteCode}
            vacationId={vacationId}
            pending={pending}
            canEdit={canEdit}
            canDelete={canDelete}
            commentText={commentText}
            setCommentText={setCommentText}
            editing={editing}
            setEditing={setEditing}
            editError={editError}
            onVoteChange={handleVote}
            onVeto={handleVeto}
            onComment={handleComment}
            onDeleteComment={handleDeleteComment}
            onStatusChange={handleStatus}
            onSaveEdit={handleEdit}
            onCancelEdit={() => setEditing(false)}
          />
        </CardContent>
      </div>
    </Card>
  );
}