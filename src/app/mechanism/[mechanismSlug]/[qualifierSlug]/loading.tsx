import { getRouteLoadingModel, RouteLoading } from "../../../_components/RouteLoading";

export default function MechanismQualifierLoading() {
  return <RouteLoading model={getRouteLoadingModel("mechanism")} />;
}
