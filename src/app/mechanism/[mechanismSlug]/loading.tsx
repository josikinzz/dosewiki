import { getRouteLoadingModel, RouteLoading } from "../../_components/RouteLoading";

export default function MechanismLoading() {
  return <RouteLoading model={getRouteLoadingModel("mechanism")} />;
}
