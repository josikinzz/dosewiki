import type { ReplicationWithUrl } from '@/types/replications';
import { applyCuratedOrder } from '@server/curatedOrder';
import { sortWithinGroup, sortWorksByDate } from './galleryOrdering';

export function orderEffectReplications(
  replications: readonly ReplicationWithUrl[],
  galleryOrder?: readonly string[],
): ReplicationWithUrl[] {
  const automatic = sortWithinGroup(
    replications.filter((replication) => Boolean(replication.url)),
  );
  return applyCuratedOrder(
    automatic,
    galleryOrder,
    (replication) => replication.slug,
  );
}

export function orderContributorReplications(
  replications: readonly ReplicationWithUrl[],
): ReplicationWithUrl[] {
  return sortWorksByDate(
    replications.filter((replication) => Boolean(replication.url)),
  );
}


