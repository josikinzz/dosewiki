import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GalleryReplication } from '@/types/replications';
import {
  ReplicationsGalleryExplorer,
  type ReplicationsGalleryExplorerProps,
} from './ReplicationsGalleryExplorer';

const navMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navMocks.push, replace: navMocks.replace }),
  useSearchParams: () => navMocks.params,
}));

// The tiles pull in matchMedia-gated hover video; none of that is under test.
vi.mock('@/features/effects/gallery/GalleryMediaTile', () => ({
  GalleryMediaTile: ({ replication }: { replication: GalleryReplication }) => (
    <div data-testid="tile">{replication.title}</div>
  ),
}));

let seq = 0;
function rep(overrides: Partial<GalleryReplication> = {}): GalleryReplication {
  seq += 1;
  return {
    _id: `id-${seq}`,
    _creationTime: seq,
    slug: `slug-${seq}`,
    title: `Work ${seq}`,
    artist: 'Chelsea Morgan',
    type: 'image',
    storage_id: `store-${seq}`,
    effect_slug: 'geometry',
    format: 'jpg',
    created_at: '2024-01-01T00:00:00.000Z',
    url: `https://cdn.test/${seq}.jpg`,
    ...overrides,
  };
}

const effects = [
  { slug: 'geometry', name: 'Geometry', tags: [] },
  { slug: 'drifting', name: 'Drifting', tags: [] },
];

const contributorDirectory = [
  { key: 'chelseamorgan', displayName: 'Chelsea Morgan', aliases: [] },
];

const corpus = [
  rep({ artist: 'Chelsea Morgan', type: 'image' }),
  rep({ artist: 'Chelsea Morgan', type: 'video', effect_slug: 'drifting' }),
  rep({ artist: 'Aria', type: 'image' }),
];

function renderExplorer(params: string, props: Partial<ReplicationsGalleryExplorerProps> = {}) {
  navMocks.params = new URLSearchParams(params);
  return render(
    <ReplicationsGalleryExplorer
      replications={corpus}
      effects={effects}
      contributorDirectory={contributorDirectory}
      {...props}
    />,
  );
}

beforeEach(() => {
  navMocks.push.mockReset();
  navMocks.replace.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('URL → rendered state', () => {
  it('renders the default browse state from the bare path', () => {
    renderExplorer('');

    expect(screen.getByRole('radio', { name: 'By artist' })).toHaveAttribute('data-state', 'on');
    expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute('data-state', 'on');
    expect(screen.getByRole('radio', { name: 'Most works' })).toHaveAttribute('data-state', 'on');
  });

  it('reproduces a pasted ?view=effect&type=video&sort=alpha state exactly', () => {
    renderExplorer('view=effect&type=video&sort=alpha');

    expect(screen.getByRole('radio', { name: 'By effect' })).toHaveAttribute('data-state', 'on');
    expect(screen.getByRole('radio', { name: 'Videos' })).toHaveAttribute('data-state', 'on');
    // Effect grouping shows the effect's name as the rail heading.
    expect(screen.getByText('Drifting')).toBeInTheDocument();
  });

  it('renders ?q= as live search results with the query in the box', () => {
    renderExplorer('q=drifting');

    expect(screen.getByRole('textbox', { name: 'Search replications' })).toHaveValue('drifting');
    expect(screen.getByText(/1 result for/)).toBeInTheDocument();
  });
});

describe('state → URL', () => {
  it('pushes the mode toggle as navigation between browse URLs', async () => {
    const user = userEvent.setup();
    renderExplorer('');

    await user.click(screen.getByRole('radio', { name: 'By effect' }));

    expect(navMocks.push).toHaveBeenCalledWith('/replications?view=effect', { scroll: false });
  });

  it('pushes the media-type filter into the query string', async () => {
    const user = userEvent.setup();
    renderExplorer('view=effect');

    await user.click(screen.getByRole('radio', { name: 'Videos' }));

    expect(navMocks.push).toHaveBeenCalledWith('/replications?view=effect&type=video', {
      scroll: false,
    });
  });

  it('debounces typed search into router.replace, preserving other params', () => {
    // fireEvent, not userEvent: userEvent's async plumbing deadlocks under
    // fake timers, and per-keystroke change events are exactly what the
    // debounce consumes anyway.
    vi.useFakeTimers();
    renderExplorer('type=video');
    const input = screen.getByRole('textbox', { name: 'Search replications' });

    for (const value of ['d', 'dri', 'drift']) {
      fireEvent.change(input, { target: { value } });
    }
    expect(navMocks.replace).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);

    // One write for three keystrokes, carrying the final text.
    expect(navMocks.replace).toHaveBeenCalledTimes(1);
    expect(navMocks.replace).toHaveBeenCalledWith('/replications?q=drift&type=video', {
      scroll: false,
    });
  });
});

describe('focused views', () => {
  it('renders an artist focus with a profile link and a back link', () => {
    renderExplorer('', { focus: { kind: 'artist', key: 'chelsea-morgan' } });

    expect(screen.getByRole('heading', { name: 'Chelsea Morgan' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View profile/ })).toHaveAttribute(
      'href',
      '/contributors/chelseamorgan',
    );
    expect(screen.getByRole('link', { name: /All artists/ })).toHaveAttribute(
      'href',
      '/replications',
    );
  });

  it('renders an unknown artist focus without a profile link', () => {
    renderExplorer('', { focus: { kind: 'artist', key: 'aria' } });

    expect(screen.getByRole('heading', { name: 'Aria' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /View profile/ })).toBeNull();
  });

  it('renders an effect focus linking to the effect article', () => {
    renderExplorer('', { focus: { kind: 'effect', key: 'drifting' } });

    expect(screen.getByRole('heading', { name: 'Drifting' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View effect article/ })).toHaveAttribute(
      'href',
      '/effects/drifting',
    );
    expect(screen.getByRole('link', { name: /All effects/ })).toHaveAttribute(
      'href',
      '/replications?view=effect',
    );
  });

  it('keeps the focus header when ?type= filters the group empty', () => {
    renderExplorer('type=video', { focus: { kind: 'artist', key: 'aria' } });

    // Aria has only images; the header must survive so the reader can escape
    // the filter, and the masonry gives way to an explanatory empty state.
    expect(screen.getByRole('heading', { name: 'Aria' })).toBeInTheDocument();
    expect(screen.getByText(/No videos here/)).toBeInTheDocument();
  });
});
