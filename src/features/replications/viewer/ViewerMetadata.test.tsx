import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReplicationWithUrl } from '@/types/replications';
import type { ReplicationViewerItem } from './viewerModel';
import { ViewerMetadata } from './ViewerMetadata';

const replication: ReplicationWithUrl = {
  _id: 'rep-1',
  _creationTime: 0,
  slug: 'tracers-chelsea-morgan',
  title: 'Tracers',
  artist: 'Chelsea Morgan',
  type: 'image',
  storage_id: 'storage-1',
  effect_slug: 'tracers',
  format: 'webp',
  created_at: '2024-01-01T00:00:00.000Z',
  url: 'https://cdn.test/tracers.webp',
};

function makeItem(overrides: Partial<ReplicationWithUrl> = {}): ReplicationViewerItem {
  return {
    replication: { ...replication, ...overrides },
    effectName: 'Tracers',
    effectSlug: 'tracers',
    effectCategories: [],
    artistProfileHref: '/replications/artist/chelsea-morgan',
    avatarUrl: null,
  };
}

describe('ViewerMetadata', () => {
  it('no longer repeats the artist display name as its own row', () => {
    render(<ViewerMetadata item={makeItem()} />);

    // The compact top line above the fold is the name's one home; the card
    // dropped its standalone Creator row.
    expect(screen.queryByText('Creator')).toBeNull();
    expect(screen.queryByText('Chelsea Morgan')).toBeNull();
  });

  it('keeps the rights holder as its own row when the record carries one', () => {
    render(<ViewerMetadata item={makeItem({ rightsholder: 'Effect Index' })} />);

    expect(screen.getByText('Rights holder')).toBeInTheDocument();
    expect(screen.getByText('Effect Index')).toBeInTheDocument();
  });

  it('claims no rights holder when the record names none', () => {
    render(<ViewerMetadata item={makeItem()} />);

    expect(screen.queryByText('Rights holder')).toBeNull();
  });

  it('keeps the licence row and the copyable attribution line', () => {
    render(
      <ViewerMetadata
        item={makeItem({
          license_name: 'CC BY-SA 4.0',
          license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
        })}
      />,
    );

    expect(screen.getByRole('link', { name: 'CC BY-SA 4.0' })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by-sa/4.0/',
    );
    // The attribution sentence may still name the artist — that is rights
    // text a reuser copies whole, not a byline.
    expect(screen.getByText(/^Tracers by Chelsea Morgan/)).toBeInTheDocument();
  });
});
