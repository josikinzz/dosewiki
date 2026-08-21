import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { GalleryReplication } from '@/types/replications';
import type { GalleryGroup } from '@/features/effects/gallery/galleryModel';
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
// The mock surfaces the explorer's prop wiring (byline policy, compact phone
// captions, the deck-open handler) and stays an anchor so tap fallthrough to
// the detail link is observable via defaultPrevented.
vi.mock('@/features/effects/gallery/GalleryMediaTile', () => ({
  GalleryMediaTile: ({
    replication,
    showByline,
    mobileCompact,
    onOpen,
  }: {
    replication: GalleryReplication;
    showByline?: boolean;
    mobileCompact?: boolean;
    onOpen?: (event: ReactMouseEvent, replication: GalleryReplication) => void;
  }) => (
    <a
      data-testid="tile"
      data-show-byline={String(showByline ?? true)}
      data-mobile-compact={String(mobileCompact ?? false)}
      href={`/replications/${replication.slug}`}
      onClick={(event) => onOpen?.(event, replication)}
    >
      {replication.title}
    </a>
  ),
}));

// The rail's scroll affordances are its own concern; this mock surfaces what
// the explorer forwards (tileBylines/mobileCompact/onTileOpen) plus the
// heading link and per-item tiles the layout tests assert against.
vi.mock('@/features/effects/gallery/MediaRail', () => ({
  MediaRail: ({
    group,
    viewAllHref,
    tileBylines,
    mobileCompact,
    onTileOpen,
  }: {
    group: GalleryGroup;
    viewAllHref: string;
    tileBylines?: boolean;
    mobileCompact?: boolean;
    onTileOpen?: (event: ReactMouseEvent, replication: GalleryReplication) => void;
  }) => (
    <section
      data-testid="rail"
      data-tile-bylines={String(tileBylines ?? true)}
      data-mobile-compact={String(mobileCompact ?? false)}
      data-view-all={viewAllHref}
      aria-label={group.label}
    >
      {group.href ? <a href={group.href}>{group.label}</a> : <span>{group.label}</span>}
      {group.items.map((item) => (
        <a
          key={item._id}
          data-testid="rail-tile"
          href={`/replications/${item.slug}`}
          onClick={(event) => onTileOpen?.(event, item as GalleryReplication)}
        >
          {item.title}
        </a>
      ))}
    </section>
  ),
}));

// The deck's swiping, scroll lock, and Escape handling are its own contract;
// here only the explorer's open/close wiring and initial position matter.
vi.mock('./components/ReplicationsSwipeDeck', () => ({
  ReplicationsSwipeDeck: ({
    groups,
    initialGroupIndex,
    initialWorkIndex,
    onClose,
  }: {
    groups: GalleryGroup[];
    initialGroupIndex?: number;
    initialWorkIndex?: number;
    onClose: () => void;
  }) => (
    <div
      data-testid="swipe-deck"
      data-group-count={groups.length}
      data-group-index={String(initialGroupIndex)}
      data-work-index={String(initialWorkIndex)}
    >
      <button type="button" onClick={onClose}>
        Close deck
      </button>
    </div>
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

/** The explorer only reads `matches`, so a stub this thin is faithful. */
function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches }));
}

beforeEach(() => {
  navMocks.push.mockReset();
  navMocks.replace.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
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

describe('un-carded gallery chrome', () => {
  it('renders the section without card chrome, keeping only width and rhythm', () => {
    renderExplorer('');

    const section = screen.getByRole('region', { name: 'Replications gallery' });
    expect(section.className).toContain('max-w-7xl');
    // The frosted control bar is now the only elevated element; the section
    // itself must not read as a card.
    expect(section.className).not.toMatch(/rounded|border|shadow|bg-/);
  });

  it('renders the corpus summary exactly once, visible at every breakpoint', () => {
    renderExplorer('');

    // getByText throws on duplicates, so this also proves the md:hidden twin
    // and the in-bar span are gone.
    const summary = screen.getByText('4 works · 2 artists · 2 effects');
    expect(summary.className).not.toMatch(/md:hidden|md:inline/);
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

describe('byline and compact wiring', () => {
  it('drops rail bylines in artist mode but keeps them on pooled tiles', () => {
    renderExplorer('');

    // The artist rail already names its artist in the heading.
    const rail = screen.getByTestId('rail');
    expect(rail).toHaveAttribute('data-tile-bylines', 'false');
    expect(rail).toHaveAttribute('data-mobile-compact', 'true');
    // The pooled masonry mixes artists, so each tile keeps its attribution.
    const pooled = screen.getByTestId('tile');
    expect(pooled).toHaveAttribute('data-show-byline', 'true');
    expect(pooled).toHaveAttribute('data-mobile-compact', 'true');
  });

  it('keeps rail bylines in effect mode, where the heading names no artist', () => {
    renderExplorer('view=effect');

    expect(screen.getByTestId('rail')).toHaveAttribute('data-tile-bylines', 'true');
  });

  it('hides bylines across an artist focus view', () => {
    renderExplorer('', { focus: { kind: 'artist', key: 'chelsea-morgan' } });

    const tiles = screen.getAllByTestId('tile');
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(tile).toHaveAttribute('data-show-byline', 'false');
    }
  });

  it('keeps bylines in an effect focus view', () => {
    renderExplorer('', { focus: { kind: 'effect', key: 'geometry' } });

    for (const tile of screen.getAllByTestId('tile')) {
      expect(tile).toHaveAttribute('data-show-byline', 'true');
    }
  });

  it('keeps bylines on search results', () => {
    renderExplorer('q=drifting');

    expect(screen.getByTestId('tile')).toHaveAttribute('data-show-byline', 'true');
  });
});

describe('fullscreen deck', () => {
  it('never auto-opens, even on a phone-shaped touch viewport', () => {
    stubMatchMedia(true);
    renderExplorer('');

    expect(screen.queryByTestId('swipe-deck')).toBeNull();
  });

  it('opens at the first work from the Watch button and closes back to the intact grid', () => {
    renderExplorer('');

    const watch = screen.getByRole('button', { name: 'Open the fullscreen gallery' });
    expect(watch).toHaveTextContent('Watch');
    fireEvent.click(watch);

    const deck = screen.getByTestId('swipe-deck');
    expect(deck).toHaveAttribute('data-group-index', '0');
    expect(deck).toHaveAttribute('data-work-index', '0');
    // The deck overlays the grid rather than replacing it, so the grid (and
    // its scroll position) survives a watch session.
    expect(screen.getByRole('textbox', { name: 'Search replications' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close deck' }));
    expect(screen.queryByTestId('swipe-deck')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Search replications' })).toBeInTheDocument();
  });

  it('opens the deck at the tapped work on a phone viewport instead of navigating', () => {
    stubMatchMedia(true);
    renderExplorer('');

    // Work 4 is Aria's only work; the deck orders artists by count, so she is
    // the second deck group and the work is her first.
    const navigated = fireEvent.click(screen.getByText('Work 4'));

    expect(navigated).toBe(false); // preventDefault: the tap stays in-page
    const deck = screen.getByTestId('swipe-deck');
    expect(deck).toHaveAttribute('data-group-index', '1');
    expect(deck).toHaveAttribute('data-work-index', '0');
  });

  it('opens the deck from rail tiles too, at that artist’s group', () => {
    stubMatchMedia(true);
    renderExplorer('');

    fireEvent.click(screen.getAllByTestId('rail-tile')[0]);

    expect(screen.getByTestId('swipe-deck')).toHaveAttribute('data-group-index', '0');
  });

  it('leaves the tile a plain detail-page link off the phone media query', () => {
    stubMatchMedia(false);
    renderExplorer('');

    const navigated = fireEvent.click(screen.getByText('Work 4'));

    expect(navigated).toBe(true); // no preventDefault: the anchor navigates
    expect(screen.queryByTestId('swipe-deck')).toBeNull();
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
    expect(screen.getByText('4 works · 2 artists · 2 effects')).toBeInTheDocument();
  });

  it('keeps the work and the whole corpus count under effect browsing', () => {
    renderExplorer('view=effect', { replications: withCreature });

    expect(screen.getByText('Withheld work')).toBeInTheDocument();
    expect(screen.getByText('5 works · 3 artists · 3 effects')).toBeInTheDocument();
  });

  it('searches the whole corpus in either mode, and counts it that way', () => {
    // A search is a deliberate ask, not idle paging, and it returns the same
    // rows whichever grouping is toggled — so the counts go corpus-wide too.
    renderExplorer('q=withheld', { replications: withCreature });

    expect(screen.getByText('Withheld work')).toBeInTheDocument();
    expect(screen.getByText('5 works · 3 artists · 3 effects')).toBeInTheDocument();
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

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // One write for three keystrokes, carrying the final text.
    expect(navMocks.replace).toHaveBeenCalledTimes(1);
    expect(navMocks.replace).toHaveBeenCalledWith('/replications?q=drift&type=video', {
      scroll: false,
    });
  });

  it('shows a pending spinner only while a query write is in the debounce window', () => {
    vi.useFakeTimers();
    renderExplorer('');
    const input = screen.getByRole('textbox', { name: 'Search replications' });

    expect(screen.queryByTestId('query-write-pending')).toBeNull();

    fireEvent.change(input, { target: { value: 'drift' } });
    expect(screen.getByTestId('query-write-pending')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByTestId('query-write-pending')).toBeNull();
    expect(navMocks.replace).toHaveBeenCalledTimes(1);
  });

  it('retires the pending spinner when a toggle cancels the scheduled write', () => {
    vi.useFakeTimers();
    renderExplorer('');
    const input = screen.getByRole('textbox', { name: 'Search replications' });

    fireEvent.change(input, { target: { value: 'drift' } });
    expect(screen.getByTestId('query-write-pending')).toBeInTheDocument();

    // Toggles flush the whole state immediately, cancelling the pending write.
    fireEvent.click(screen.getByRole('radio', { name: 'By effect' }));

    expect(screen.queryByTestId('query-write-pending')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(navMocks.replace).not.toHaveBeenCalled();
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
