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
import { getPropertyStats } from "@/lib/sort-properties";
import { formatPrice, cn } from "@/lib/utils";
import {
  ExternalLink,
  Ban,
  Trash2,
  MessageCircle,
  CheckCircle2,
  XCircle,
  Pencil,
  MapPin,
} from "lucide-react";
import type { Property, ParticipantRole } from "@/lib/types";

interface PropertyCardProps {
  property: Property;
  vacationId: string;
  inviteCode: string;
  userId: string | null;
  userRole: ParticipantRole | null;
  participantCount: number;
  allVetoes: { property_id: string; user_id: string }[];
}

const statusConfig = {
  active: { label: "Aktiv", variant: "default" as const },
  eliminated: { label: "Ausgeschieden", variant: "danger" as const },
  booked: { label: "Gebucht", variant: "success" as const },
};

export function PropertyCard({
  property,
  vacationId,
  inviteCode,
  userId,
  userRole,
  participantCount,
  allVetoes,
}: PropertyCardProps) {
  const [pending, startTransition] = useTransition();
  const [commentText, setCommentText] = useState("");
  const [showComments, setShowComments] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const stats = getPropertyStats(property, userId ?? undefined, allVetoes);
  const status = statusConfig[property.status];
  const pricePerPerson =
    property.price && participantCount > 0
      ? property.price / participantCount
      : null;

  const canDelete =
    userRole === "owner" || property.suggested_by === userId;
  // User story 8: any participant can complete missing info
  const canEdit = userRole !== null;

  function handleVote(stars: number) {
    if (!userId) return;
    startTransition(async () => {
      if (stats.userVote === stars) {
        // Clicking the current star removes the vote
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
        "overflow-hidden transition-opacity",
        property.status === "eliminated" && "opacity-60",
        property.status === "booked" && "ring-2 ring-emerald-500"
      )}
    >
      <div className="flex flex-col sm:flex-row">
        <div className="relative h-48 w-full shrink-0 sm:h-auto sm:w-48">
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
        </div>

        <CardContent className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-slate-900">
                  {property.title ?? "Unbenanntes Haus"}
                </h3>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              {property.provider && (
                <p className="text-xs text-slate-500">{property.provider}</p>
              )}
            </div>
            <a
              href={property.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-teal-600 hover:text-teal-700"
            >
              <ExternalLink className="h-5 w-5" />
            </a>
          </div>

          {editing && (
            <form onSubmit={handleEdit} className="space-y-3 rounded-xl bg-slate-50 p-3">
              <div className="space-y-1">
                <Label htmlFor={`title-${property.id}`}>Titel</Label>
                <Input
                  id={`title-${property.id}`}
                  name="title"
                  defaultValue={property.title ?? ""}
                  placeholder="Titel des Hauses"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={`address-${property.id}`}>
                  <MapPin className="h-4 w-4 inline mr-1" />
                  Adresse (optional – für Kartenansicht)
                </Label>
                <Input
                  id={`address-${property.id}`}
                  name="address"
                  defaultValue={property.address ?? ""}
                  placeholder="z.B. Musterstraße 12, 12345 Berlin"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor={`price-${property.id}`}>Gesamtpreis (€)</Label>
                  <Input
                    id={`price-${property.id}`}
                    name="price"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={property.price ?? ""}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`bedrooms-${property.id}`}>Schlafzimmer</Label>
                  <Input
                    id={`bedrooms-${property.id}`}
                    name="bedrooms"
                    type="number"
                    min="0"
                    defaultValue={property.bedrooms ?? ""}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`beds-${property.id}`}>Betten</Label>
                  <Input
                    id={`beds-${property.id}`}
                    name="beds"
                    type="number"
                    min="0"
                    defaultValue={property.beds ?? ""}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`bathrooms-${property.id}`}>Badezimmer</Label>
                  <Input
                    id={`bathrooms-${property.id}`}
                    name="bathrooms"
                    type="number"
                    min="0"
                    step="0.5"
                    defaultValue={property.bathrooms ?? ""}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="has_pool"
                  defaultChecked={property.has_pool}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Pool vorhanden
              </label>
              {editError && (
                <p className="text-sm text-red-600">{editError}</p>
              )}
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={pending}>
                  Speichern
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(false)}
                  disabled={pending}
                >
                  Abbrechen
                </Button>
              </div>
            </form>
          )}

          <div className="flex flex-wrap gap-3 text-sm text-slate-600">
            {property.price != null && (
              <span>
                <strong>{formatPrice(property.price)}</strong> gesamt
                {pricePerPerson != null && (
                  <span className="text-slate-400">
                    {" "}
                    · {formatPrice(pricePerPerson)}/Person
                  </span>
                )}
              </span>
            )}
            {property.bedrooms != null && <span>{property.bedrooms} SZ</span>}
            {property.beds != null && <span>{property.beds} Betten</span>}
            {property.bathrooms != null && (
              <span>{property.bathrooms} Bad</span>
            )}
            {property.has_pool && <span>Pool</span>}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <StarRating
                value={stats.userVote}
                onChange={handleVote}
                disabled={!userId || pending}
                size="sm"
              />
              <span className="text-sm text-slate-500">
                {stats.totalStars}/{stats.voteCount * 5 || "–"} (
                {stats.voteCount} Stimmen)
              </span>
            </div>

            <Button
              variant={stats.userVeto ? "destructive" : "outline"}
              size="sm"
              onClick={handleVeto}
              disabled={!userId || pending}
            >
              <Ban className="h-4 w-4" />
              {stats.userVeto ? "Veto zurücknehmen" : "Veto"}{" "}
              {stats.vetoCount > 0 && `(${stats.vetoCount})`}
            </Button>
          </div>

          {userRole === "owner" && (
            <div className="flex flex-wrap gap-2">
              {property.status !== "booked" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleStatus("booked")}
                  disabled={pending}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Als gebucht markieren
                </Button>
              )}
              {property.status !== "eliminated" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleStatus("eliminated")}
                  disabled={pending}
                >
                  <XCircle className="h-4 w-4" />
                  Ausscheiden
                </Button>
              )}
              {property.status !== "active" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleStatus("active")}
                  disabled={pending}
                >
                  Reaktivieren
                </Button>
              )}
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={() => setShowComments(!showComments)}
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
            >
              <MessageCircle className="h-4 w-4" />
              {(property.comments ?? []).length} Kommentare
            </button>

            {showComments && (
              <div className="mt-3 space-y-3">
                {(property.comments ?? []).map((comment) => (
                  <div
                    key={comment.id}
                    className="rounded-xl bg-slate-50 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {comment.profile?.name ?? "Unbekannt"}
                        {comment.stars && (
                          <span className="ml-2">
                            <StarDisplay stars={comment.stars} />
                          </span>
                        )}
                      </span>
                      {comment.user_id === userId && (
                        <button
                          type="button"
                          onClick={() =>
                            startTransition(async () => {
                              await deleteComment(comment.id, inviteCode);
                            })
                          }
                          className="text-slate-400 hover:text-red-500"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-slate-600">{comment.text}</p>
                  </div>
                ))}

                {userId && (
                  <form onSubmit={handleComment} className="flex gap-2">
                    <Input
                      placeholder="Kommentar hinzufügen..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                    />
                    <Button type="submit" size="sm" disabled={pending}>
                      Senden
                    </Button>
                  </form>
                )}
              </div>
            )}
          </div>

          {(canEdit || canDelete) && (
            <div className="mt-auto flex gap-2 pt-2">
              {canEdit && !editing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(true)}
                  disabled={pending}
                >
                  <Pencil className="h-4 w-4" />
                  Bearbeiten
                </Button>
              )}
              {canDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  disabled={pending}
                  className="text-red-500 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                  Löschen
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </div>
    </Card>
  );
}
