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
  rep({ artist: 'Chelsea Morgan', type: 'image' }),
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
    // The spotlight row is gone: density-first, media starts immediately.
    expect(screen.queryByText('Spotlight')).toBeNull();
  });

  it('reproduces a pasted ?view=effect&type=video&sort=alpha state exactly', () => {
    renderExplorer('view=effect&type=video&sort=alpha');

    expect(screen.getByRole('radio', { name: 'By effect' })).toHaveAttribute('data-state', 'on');
    expect(screen.getByRole('radio', { name: 'Videos' })).toHaveAttribute('data-state', 'on');
    // One video total: too thin for a rail, so it pools straight into the
    // masonry — and with no rails above it, the "More effects" heading is
    // dropped rather than describing everything as "more".
    expect(screen.getByText('Work 2')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'More effects' })).toBeNull();
  });

  it('renders ?q= as live search results with the query in the box', () => {
    renderExplorer('q=drifting');

    expect(screen.getByRole('textbox', { name: 'Search replications' })).toHaveValue('drifting');
    expect(screen.getByText(/1 result for/)).toBeInTheDocument();
  });
});

describe('hybrid browse layout', () => {
  it('gives artists with three or more works a rail and pools the rest', () => {
    renderExplorer('');

    // Chelsea (3 works) earns a rail whose heading links to her profile.
    expect(screen.getByRole('link', { name: 'Chelsea Morgan' })).toHaveAttribute(
      'href',
      '/contributors/chelseamorgan',
    );
    // Aria (1 work) gets no rail of her own…
    expect(screen.queryByText('Aria')).toBeNull();
    // …her work pools into the "More artists" masonry instead.
    expect(screen.getByRole('heading', { name: 'More artists' })).toBeInTheDocument();
    expect(screen.getByText('Work 4')).toBeInTheDocument();
  });

  it('rails effects with enough works and pools thin effects behind them', () => {
    renderExplorer('view=effect');

    // Geometry (3 works) keeps a rail; Drifting (1 work) pools below it.
    expect(screen.getByRole('link', { name: 'Geometry' })).toHaveAttribute(
      'href',
      '/effects/geometry',
    );
    expect(screen.getByRole('heading', { name: 'More effects' })).toBeInTheDocument();
    expect(screen.getByText('Work 2')).toBeInTheDocument();
  });

  it('keeps the artist-sort control mounted but hidden in effect mode, so the bar cannot jitter', () => {
    renderExplorer('view=effect');

    expect(screen.getByText('Most works').closest('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('effects withheld from artist browsing', () => {
  const withCreature = [
    ...corpus,
    rep({ artist: 'Giger', title: 'Withheld work', effect_slug: 'unspeakable-horrors' }),
  ];

  it('drops the work, its artist, and their share of the header counts', () => {
    renderExplorer('', { replications: withCreature });

    expect(screen.queryByText('Withheld work')).toBeNull();
    expect(screen.queryByText('Giger')).toBeNull();
    // Four works, not five: the header describes what artist browsing can
    // actually show, or it is claiming a work the grid will never render.
    expect(screen.getAllByText('4 works · 2 artists · 2 effects').length).toBeGreaterThan(0);
  });

  it('keeps the work and the whole corpus count under effect browsing', () => {
    renderExplorer('view=effect', { replications: withCreature });

    expect(screen.getByText('Withheld work')).toBeInTheDocument();
    expect(screen.getAllByText('5 works · 3 artists · 3 effects').length).toBeGreaterThan(0);
  });

  it('searches the whole corpus in either mode, and counts it that way', () => {
    // A search is a deliberate ask, not idle paging, and it returns the same
    // rows whichever grouping is toggled — so the counts go corpus-wide too.
    renderExplorer('q=withheld', { replications: withCreature });

    expect(screen.getByText('Withheld work')).toBeInTheDocument();
    expect(screen.getAllByText('5 works · 3 artists · 3 effects').length).toBeGreaterThan(0);
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
