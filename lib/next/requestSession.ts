import "server-only";

import { cache } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@auth";

export const getRequestSession = cache(() => getServerSession(authOptions));
