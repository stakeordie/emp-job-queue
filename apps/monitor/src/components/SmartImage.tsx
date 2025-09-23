'use client';

import Image from 'next/image';
import type { ImageProps } from 'next/image';
import { useState } from 'react';

interface SmartImageProps extends Omit<ImageProps, 'onError'> {
  fallbackSrc?: string;
  format?: 'webp' | 'png' | 'jpeg' | 'jpg' | 'gif';
}

// List of domains we have configured in next.config
const CONFIGURED_DOMAINS = [
  'api-openstudio.emprops.ai',
  'api.emprops.ai',
  'emprops.ai',
  'cdn-emerge.emprops.ai',
  'cdn.emprops.ai',
  'storage.googleapis.com',
  'imagedelivery.net',
  'localhost',
  'res.cloudinary.com',
  'i.imgur.com',
  'lh3.googleusercontent.com',
  'pbs.twimg.com',
  'avatars.githubusercontent.com',
  'cdn.discordapp.com',
  'ipfs.io',
  'gateway.pinata.cloud',
];

function isConfiguredDomain(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    const isConfigured = CONFIGURED_DOMAINS.some(domain => {
      // Handle wildcards like *.imagedelivery.net
      if (domain.includes('*')) {
        const pattern = domain.replace('*.', '');
        return hostname.endsWith(pattern);
      }
      return hostname === domain || hostname.endsWith(`.${domain}`);
    });

    return isConfigured;
  } catch {
    // If URL parsing fails, assume it's a relative path (which is always allowed)
    return true;
  }
}

function isEmpropsCdn(url: string): boolean {
  return typeof url === 'string' &&
    (url.includes('cdn.emprops.ai') || url.includes('cdn-emerge.emprops.ai') || url.includes('api.emprops.ai'));
}

/**
 * Thumbor loader for emprops CDN images using /unsafe/ routes
 */
function thumborLoader({ src, width, quality, format }: {
  src: string;
  width: number;
  quality?: number;
  format?: string;
}) {
  try {
    // Basic validation
    if (!src || !width) {
      console.log("🖼️ Thumbor loader - Invalid input:", { src, width });
      return src;
    }

    // Parse URL safely
    let url;
    try {
      url = new URL(src);
    } catch {
      console.log("🖼️ Thumbor loader - Invalid URL format:", src);
      return src;
    }

    // Only apply Thumbor processing to our CDN domains
    if (!url.hostname.includes("emprops.ai")) {
      return src;
    }

    // Extract relative path from CDN URL for Thumbor processing
    const relativePath = url.pathname.replace(/^\//, ""); // Remove leading slash

    // Generate proper Thumbor URL with format conversion and quality optimization
    const isGif = url.pathname.toLowerCase().endsWith('.gif');

    // Conservative approach: NEVER convert GIFs unless explicitly requested
    let targetFormat = format;
    if (!targetFormat) {
      if (isGif) {
        targetFormat = 'gif'; // Always preserve GIFs
      } else {
        targetFormat = 'webp'; // Only convert non-GIF images
      }
    }

    const operations = `fit-in/${width}x0/filters:format(${targetFormat}):quality(${quality || 90})`;

    // Use /unsafe/ route which is handled by frontdoor for thumbor
    const thumborUrl = `${url.origin}/unsafe/${operations}/${relativePath}`;

    console.log("🖼️ Thumbor loader - Generated URL:", {
      original: src,
      thumbor: thumborUrl,
      width,
      quality,
      format: targetFormat,
      isGif,
    });

    return thumborUrl;
  } catch (error) {
    console.error("🖼️ Thumbor loader error:", error);
    return src;
  }
}

/**
 * CdnImage component for emprops CDN images with Thumbor optimization
 */
function CdnImage({ format, ...props }: SmartImageProps) {
  const [useFallback, setUseFallback] = useState(false);

  // Check if the src needs the CDN loader
  const needsCdnLoader = typeof props.src === 'string' && isEmpropsCdn(props.src);

  // Handle error and fallback logic
  const handleError = () => {
    if (!useFallback) {
      console.warn('🔄 Thumbor failed, falling back to original CDN URL:', props.src);
      setUseFallback(true);
    } else {
      console.error('❌ Both Thumbor and original CDN failed:', props.src);
    }
  };

  // Use the CDN loader only for CDN images
  if (needsCdnLoader && !useFallback) {
    // Create a custom loader that includes the format
    const loaderWithFormat = ({ src, width, quality }: { src: string; width: number; quality?: number }) => {
      return thumborLoader({ src, width, quality, format });
    };

    return <Image {...props} loader={loaderWithFormat} onError={handleError} />;
  }

  // Fallback: Use regular Next.js Image optimization for CDN domains
  if (needsCdnLoader && useFallback) {
    return <Image {...props} onError={handleError} />;
  }

  // For local images and other sources, use default Next.js Image
  return <Image {...props} />;
}

export default function SmartImage({ src, alt = "image", fallbackSrc, format, ...props }: SmartImageProps) {
  // Handle null/undefined src
  if (!src) {
    return <Image src={fallbackSrc || "/placeholder.png"} alt={alt} {...props} />;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srcString = typeof src === 'string' ? src : (src as any).src || '';

  if (!srcString) {
    return <Image src={fallbackSrc || "/placeholder.png"} alt={alt} {...props} />;
  }

  // For emprops CDN images, use CdnImage for Thumbor optimization
  if (isEmpropsCdn(srcString)) {
    return <CdnImage src={src} alt={alt} format={format} {...props} />;
  }

  // For configured domains, use regular Next.js Image with optimization
  if (isConfiguredDomain(srcString)) {
    return <Image src={src} alt={alt} {...props} />;
  }

  // For unknown external domains, bypass optimization to avoid errors
  return <Image src={src} alt={alt} {...props} unoptimized />;
}