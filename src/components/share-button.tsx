"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Share2, Check, Copy } from "lucide-react";

interface ShareButtonProps {
  inviteCode: string;
  vacationName: string;
}

export function ShareButton({ inviteCode, vacationName }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
  const inviteUrl = `${appUrl}/v/${inviteCode}`;
  const shareText = `Komm mit in „${vacationName}" auf HolidayVote!`;

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: vacationName,
          text: shareText,
          url: inviteUrl,
        });
      } catch {
        handleCopy();
      }
    } else {
      handleCopy();
    }
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={handleShare}>
        <Share2 className="h-4 w-4" />
        Einladen
      </Button>
      <Button variant="ghost" size="sm" onClick={handleCopy}>
        {copied ? (
          <Check className="h-4 w-4 text-emerald-600" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
        {copied ? "Kopiert!" : "Link"}
      </Button>
    </div>
  );
}
