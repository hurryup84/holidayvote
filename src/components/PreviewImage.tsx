import { useEffect, useState } from 'react';
import { avatarIcon } from './houseAvatars';
import { usePreview } from './usePreview';
import './preview.css';

/**
 * The picture of a holiday home from this phone's preview cache (fetched once from the provider's page,
 * then kept on the phone – never uploaded). While loading: a soft placeholder; no picture (page blocks
 * previews, offline, broken link): the house's chosen icon.
 */
export function PreviewImage({ url, avatar, className = '', alt = '' }: { url: string; avatar?: string | null; className?: string; alt?: string }) {
  const { preview, loading } = usePreview(url);
  const src = preview?.imageSrc ?? null;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (src && !failed) {
    return (
      <img
        className={`preview-img ${className}`}
        src={src}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className={`preview-img preview-fallback ${loading ? 'loading' : ''} ${className}`} aria-hidden>
      <span>{avatarIcon(avatar)}</span>
    </div>
  );
}
