import { useEffect, useState, type ReactNode } from "react";

type Props = {
  src?: string | null;
  alt?: string;
  className: string;
  fallback: ReactNode;
  loading?: "eager" | "lazy";
};

/** Telegram photo URLs are external and can fail independently of the profile API. */
export function TelegramAvatarImage({ src, alt = "", className, fallback, loading = "lazy" }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  useEffect(() => {
    setFailedSrc(null);
  }, [src]);

  if (!src || failedSrc === src) return <>{fallback}</>;

  return (
    <img
      key={src}
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
    />
  );
}
