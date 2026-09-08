import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval(
  "recover public cache publications",
  { minutes: 1 },
  internal.publicationDelivery.reconcile,
  {},
);
export default crons;
