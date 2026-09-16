import "server-only";

import { cache } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@auth";

/** Share verified auth within one server render, never across requests. */
export const getRequestSession = cache(() => getServerSession(authOptions));
