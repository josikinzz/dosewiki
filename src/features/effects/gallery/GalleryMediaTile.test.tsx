import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GalleryMediaTile } from './GalleryMediaTile';
import type { GalleryReplication } from '@/types/replications';

const VIDEO: GalleryReplication = {
  _id: 'k57geometryfrog',
  _creationTime: 0,
  slug: 'geometry-frog-symmetric-vision',
  title: 'Geometry Frog',
  artist: 'Symmetric Vision',
  effect_slug: 'geometry',
  type: 'video',
  storage_id: 'kg57geometryfrog',
  format: 'mp4',
  created_at: '2024-01-01',
  url: 'https://example.test/geometry-frog.mp4',
  thumbnail_url: 'https://example.test/geometry-frog.jpg',
  width: 1280,
  height: 720,
};

/**
 * jsdom ships no matchMedia, and the hover preview is gated on it. Report a
 * desktop mouse so the preview can mount at all — on any other pointer the
 * video never renders and there is nothing to assert.
 */
function stubDesktopPointer() {
  vi.stubGlobal(
    'matchMedia',
    (query: string): MediaQueryList =>
      ({
        matches: query.includes('hover: hover'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

/**
 * jsdom implements no media playback, so `play()` returns undefined where the
 * component expects the promise every browser returns.
 */
function stubPlayback() {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GalleryMediaTile', () => {
  it('links the whole frame to the work', () => {
    render(<GalleryMediaTile replication={VIDEO} />);

    expect(screen.getByRole('link')).toHaveAttribute('href', `/replications/${VIDEO.slug}`);
  });

  it('lets a click on the hover preview reach the link underneath it', async () => {
    stubDesktopPointer();
    stubPlayback();
    const user = userEvent.setup();

    const { container } = render(<GalleryMediaTile replication={VIDEO} />);
    await user.hover(screen.getByRole('link'));

    // The preview is the anchor's last child at inset-0, so it is the topmost
    // hit target across the entire tile, and a browser does not forward a media
    // element's click to an ancestor anchor the way it does for an image.
    // Without this guard every video tile stops navigating — which is how it
    // shipped once.
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video).toHaveClass('pointer-events-none');
  });

  it('mounts no preview when the pointer is not a hover-capable mouse', async () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string): MediaQueryList =>
        ({
          matches: false,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    const user = userEvent.setup();

    const { container } = render(<GalleryMediaTile replication={VIDEO} />);
    await user.hover(screen.getByRole('link'));

    // A touch device must never autoload video on tap.
    expect(container.querySelector('video')).toBeNull();
  });
});
