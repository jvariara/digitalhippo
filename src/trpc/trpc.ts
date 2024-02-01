import { User } from "@/payload-types";
import { ExpressContext } from "@/server";
import { TRPCError, initTRPC } from "@trpc/server";
import { PayloadRequest } from "payload/types";

// serve the purpose of giving router that lets us define api endpoints on backend
const t = initTRPC.context<ExpressContext>().create();
// middleware to check if user is logged in
const middleware = t.middleware;
const isAuth = middleware(async ({ ctx, next }) => {
  const req = ctx.req as PayloadRequest;

  const { user } = req as { user: User | null };

  if (!user || !user.id) {
    // do not proceed with request
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  // they are logged in
  return next({
    ctx: {
      user,
    },
  });
});

export const router = t.router;
// so anyone can call these endpoints
export const publicProcedure = t.procedure;
// have to be logged in to use these endpoints
export const privateProcedure = t.procedure.use(isAuth);
