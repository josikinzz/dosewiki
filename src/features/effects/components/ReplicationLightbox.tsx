'use client';

import { useMemo } from 'react';
import Lightbox, { type Slide } from 'yet-another-react-lightbox';
import Captions from 'yet-another-react-lightbox/plugins/captions';
import Counter from 'yet-another-react-lightbox/plugins/counter';
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails';
import Video from 'yet-another-react-lightbox/plugins/video';
import type { ReplicationWithUrl } from '@/types/replications';
import { getCreditLine, getRightsSummary } from './replicationCredit';

const VIDEO_MIME_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  ogv: 'video/ogg',
};

const getMimeType = (format: string) => VIDEO_MIME_TYPES[format?.toLowerCase()] || `video/${format}`;

interface ReplicationLightboxProps {
  /** Ordered replications the lightbox steps through. */
  replications: ReplicationWithUrl[];
  /** Index of the currently open slide; -1 (or < 0) keeps the lightbox closed. */
  index: number;
  /** Fired when the active slide changes (arrows, swipe, thumbnails). */
  onIndexChange: (index: number) => void;
  /** Fired when the lightbox should close. */
  onClose: () => void;
}

/**
 * The shared theater viewer for replication media. Builds image/video slides,
 * the plum-themed YARL chrome (see src/styles/lightbox.css), and the
 * Creator / Source / License toolbar. Consumed by both the per-effect article
 * gallery and the cross-effect Gallery tab so viewing is identical everywhere.
 */
export function ReplicationLightbox({
  replications,
  index,
  onIndexChange,
  onClose,
}: ReplicationLightboxProps) {
  const slides = useMemo<Slide[]>(
    () =>
      replications.map((replication) => {
        const sharedSlideProps = {
          width: replication.width,
          height: replication.height,
          title: replication.title,
          description: `${getCreditLine(replication)} ${getRightsSummary(replication)}`,
        };

        if (replication.type === 'video') {
          return {
            type: 'video',
            poster: replication.thumbnail_url,
            sources: [
              {
                src: replication.url,
                type: getMimeType(replication.format),
              },
            ],
            ...sharedSlideProps,
          };
        }

        return {
          src: replication.url,
          alt: replication.title,
          ...sharedSlideProps,
        };
      }),
    [replications],
  );

  const isOpen = index >= 0 && index < replications.length;
  const activeReplication = isOpen ? replications[index] ?? null : null;

  return (
    <Lightbox
      open={isOpen}
      close={onClose}
      index={isOpen ? index : 0}
      slides={slides}
      plugins={[Captions, Counter, Thumbnails, Video]}
      carousel={{
        finite: replications.length < 2,
        imageFit: 'contain',
      }}
      controller={{
        closeOnBackdropClick: true,
      }}
      captions={{
        showToggle: true,
        descriptionTextAlign: 'start',
        descriptionMaxLines: 2,
      }}
      counter={{
        container: {
          style: {
            top: 'unset',
            bottom: '12px',
            left: 'unset',
            right: '12px',
          },
        },
      }}
      thumbnails={{
        width: 72,
        height: 72,
        border: 0,
        padding: 0,
        gap: 10,
        imageFit: 'cover',
        vignette: false,
      }}
      video={{
        autoPlay: true,
        controls: true,
        playsInline: true,
        preload: 'metadata',
      }}
      toolbar={{
        buttons: [
          activeReplication ? (
            <a
              key="open-original"
              href={activeReplication.url}
              target="_blank"
              rel="noopener noreferrer"
              className="yarl-open-original"
            >
              Open original
            </a>
          ) : null,
          activeReplication?.artist_url ? (
            <a
              key="open-creator"
              href={activeReplication.artist_url}
              target="_blank"
              rel="noopener noreferrer"
              className="yarl-open-original"
            >
              Creator
            </a>
          ) : null,
          activeReplication?.source_url ? (
            <a
              key="open-source"
              href={activeReplication.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="yarl-open-original"
            >
              Source
            </a>
          ) : null,
          activeReplication?.license_url ? (
            <a
              key="open-license"
              href={activeReplication.license_url}
              target="_blank"
              rel="noopener noreferrer"
              className="yarl-open-original"
            >
              License
            </a>
          ) : null,
          'close',
        ],
      }}
      on={{
        view: ({ index: nextIndex }) => onIndexChange(nextIndex),
      }}
    />
  );
}
