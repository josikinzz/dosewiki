import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MediaRail } from './MediaRail';
import type { GalleryGroup } from './galleryModel';

vi.mock('@/components/common/AppImage', () => ({
  AppImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const group = (overrides: Partial<GalleryGroup> = {}): GalleryGroup => ({
  key: 'symmetric vision',
  label: 'Symmetric Vision',
  count: 0,
  imageCount: 0,
  videoCount: 0,
  items: [],
  ...overrides,
});

describe('MediaRail heading', () => {
  it("sends the artist's name to their profile, not their own site", () => {
    render(
      <MediaRail
        group={group({ href: '/contributors/symmetricvision', externalUrl: 'https://sv.test' })}
        viewAllHref="/replications/artist/symmetric-vision"
      />,
    );

    expect(screen.getByRole('link', { name: 'Symmetric Vision' })).toHaveAttribute(
      'href',
      '/contributors/symmetricvision',
    );
  });

  it('keeps the personal site reachable as its own link', () => {
    render(
      <MediaRail
        group={group({ href: '/contributors/symmetricvision', externalUrl: 'https://sv.test' })}
        viewAllHref="/replications/artist/symmetric-vision"
      />,
    );

    // Nineteen artists carry a site that is not on their profile, so this must
    // not simply disappear when the name starts pointing inward.
    const site = screen.getByRole('link', { name: /own site/ });
    expect(site).toHaveAttribute('href', 'https://sv.test');
    expect(site).toHaveAttribute('target', '_blank');
  });

  it('leaves an artist with no profile on exactly their old behaviour', () => {
    render(
      <MediaRail
        group={group({ externalUrl: 'https://nobody.test' })}
        viewAllHref="/replications/artist/symmetric-vision"
      />,
    );

    expect(screen.getByRole('link', { name: 'Symmetric Vision' })).toHaveAttribute(
      'href',
      'https://nobody.test',
    );
  });

  it('renders a plain name when there is nowhere to send the reader', () => {
    render(<MediaRail group={group()} viewAllHref="/replications/artist/symmetric-vision" />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Symmetric Vision')).toBeInTheDocument();
  });
});

describe('MediaRail view-all affordance', () => {
  it('renders "View all" as a real focus URL, not client state', () => {
    // Two works, none inline (an empty preview keeps jsdom clear of the media
    // tile's matchMedia needs): both the header affordance and the rail-end
    // tile must be crawlable anchors to the group's focus route.
    render(
      <MediaRail
        group={group({ count: 2 })}
        viewAllHref="/replications/artist/symmetric-vision?type=video"
      />,
    );

    const links = screen.getAllByRole('link', { name: /View all 2/ });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/replications/artist/symmetric-vision?type=video');
    }
  });
});
