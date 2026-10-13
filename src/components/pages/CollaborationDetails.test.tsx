import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CollaborationDetails } from "./CollaborationDetails.client";

afterEach(() => window.history.replaceState(null, "", "/"));

it("reveals only the targeted collaboration on arrival and later hash navigation", () => {
  window.history.replaceState(null, "", "/about#collaboration-piru");
  render(<><CollaborationDetails id="collaboration-piru"><summary>Piru</summary></CollaborationDetails><CollaborationDetails id="collaboration-tripsit"><summary>TripSit</summary></CollaborationDetails></>);
  expect(screen.getByText("Piru").closest("details")).toHaveAttribute("open");
  expect(screen.getByText("TripSit").closest("details")).not.toHaveAttribute("open");
  window.history.replaceState(null, "", "/about#collaboration-tripsit");
  fireEvent(window, new HashChangeEvent("hashchange"));
  expect(screen.getByText("TripSit").closest("details")).toHaveAttribute("open");
});
