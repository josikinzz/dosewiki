import {
  DURATION_ORDER,
  DURATION_ROUTE_ORDER,
  DURATION_STAGE_ORDER,
  DURATION_STAGES_ORDER,
} from './orders.mjs';
import { orderObject, reorderOrderedRecord } from './core.mjs';

function reorderDurationStage(stage, options) { if (!stage) return stage;
return orderObject(stage, DURATION_STAGE_ORDER, { ...options, context: 'duration_stage' }); }

function reorderDurationStages(stages, options) { if (stages === null || stages === undefined) return stages;
return reorderOrderedRecord(stages, DURATION_STAGES_ORDER, (stage) => reorderDurationStage(stage, options)); }

function reorderDurationRoute(route, options) { if (!route) return route;
const result = { ...route };
if (result.stages) {
  result.stages = reorderDurationStages(result.stages, options);
}
return orderObject(result, DURATION_ROUTE_ORDER, { ...options, context: 'duration_route' }); }

export function reorderDuration(duration, options) {
  if (!duration) return duration;
  const result = { ...duration };
  if (Array.isArray(result.routes)) {
    result.routes = result.routes.map((route) => reorderDurationRoute(route, options));
  }
  return orderObject(result, DURATION_ORDER, { ...options, context: 'duration' });
}
