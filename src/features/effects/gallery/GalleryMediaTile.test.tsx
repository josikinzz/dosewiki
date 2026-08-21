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

/**
 * jsdom ships no IntersectionObserver; report every observed element as
 * immediately, fully in view so the autoplay path can engage.
 */
function stubEverythingInView() {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
      disconnect() {}
    },
  );
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

  it('autoplays the preview rendition, not the full source, once in view', () => {
    stubDesktopPointer();
    stubPlayback();
    stubEverythingInView();
    const preview = { ...VIDEO, preview_url: 'https://example.test/geometry-frog-preview.mp4' };

    const { container } = render(<GalleryMediaTile replication={preview} />);

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute('src', preview.preview_url);
    expect(video).toHaveAttribute('preload', 'metadata');
    expect(video).toHaveClass('pointer-events-none');
  });

  it('never autoplays for reduced-motion readers but still labels the tile a video', () => {
    // Reduced motion: every media query except none matches... report only
    // the reduced-motion query as matching.
    vi.stubGlobal(
      'matchMedia',
      (query: string): MediaQueryList =>
        ({
          matches: query.includes('prefers-reduced-motion'),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    stubEverythingInView();
    const preview = { ...VIDEO, preview_url: 'https://example.test/geometry-frog-preview.mp4' };

    const { container } = render(<GalleryMediaTile replication={preview} />);

    expect(container.querySelector('video')).toBeNull();
    // The chip is their signal that the still is actually a video.
    expect(screen.getByText('Video')).toBeInTheDocument();
  });

  it('shows a duration chip in m:ss on video tiles', () => {
    render(<GalleryMediaTile replication={{ ...VIDEO, duration: 83.4 }} />);

    expect(screen.getByText('1:23')).toBeInTheDocument();
  });
});

describe('GalleryMediaTile caption contract', () => {
  it('shows the title and byline by default', () => {
    render(<GalleryMediaTile replication={VIDEO} />);

    expect(screen.getByText('Geometry Frog')).toBeInTheDocument();
    expect(screen.getByText('by Symmetric Vision')).toBeInTheDocument();
  });

  it('drops only the byline when showByline is false', () => {
    // Artist rails already name the artist in their heading; repeating it
    // under all fourteen tiles is the same words fourteen times.
    render(<GalleryMediaTile replication={VIDEO} showByline={false} />);

    expect(screen.getByText('Geometry Frog')).toBeInTheDocument();
    expect(screen.queryByText('by Symmetric Vision')).toBeNull();
  });

  it('hides the whole caption below md when mobileCompact', () => {
    const { container } = render(<GalleryMediaTile replication={VIDEO} mobileCompact />);

    // The class carries the contract: phone tiles are media-only and pay no
    // mt-2 spacing for a caption they never show.
    expect(container.querySelector('figcaption')).toHaveClass('max-md:hidden');
  });
});

describe('GalleryMediaTile onOpen', () => {
  it('routes clicks through onOpen while staying a crawlable anchor', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn((event: React.MouseEvent, _work: unknown) => event.preventDefault());

    render(<GalleryMediaTile replication={VIDEO} onOpen={onOpen} />);

    // Still a real link — new-tab and crawling must survive interception.
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', `/replications/${VIDEO.slug}`);

    await user.click(link);

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][1]).toEqual(VIDEO);
  });
});
