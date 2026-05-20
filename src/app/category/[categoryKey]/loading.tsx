import { getRouteLoadingModel, RouteLoading } from "../../_components/RouteLoading";

export default function Loading() {
  return <RouteLoading model={getRouteLoadingModel("category")} />;
}
