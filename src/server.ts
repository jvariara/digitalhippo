// using express to self host the server
import express from "express";
import { getPayloadClient } from "./get-payload";
import { nextApp, nextHandler } from "./next-utils";
import * as trpcExpress from "@trpc/server/adapters/express";
import { appRouter } from "./trpc";
import { inferAsyncReturnType } from "@trpc/server";
import bodyParser from "body-parser";
import { IncomingMessage } from "http";
import { stripeWebhookHandler } from "./webhooks";
import nextBuild from "next/dist/build";
import path from "path";
import { PayloadRequest } from "payload/types";
import { parse } from "url";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const createContext = ({
  req,
  res,
}: trpcExpress.CreateExpressContextOptions) => ({
  req,
  res,
});

export type ExpressContext = inferAsyncReturnType<typeof createContext>;

export type WebhookRequest = IncomingMessage & { rawBody: Buffer };

const start = async () => {
  // bodyparser allows us to receiver proper notfication from stripe
  const webhookMiddleware = bodyParser.json({
    verify: (req: WebhookRequest, _, buffer) => {
      req.rawBody = buffer;
    },
  });

  app.post("/api/webhooks/stripe", webhookMiddleware, stripeWebhookHandler);

  // start up admin dashboard (CMS)
  const payload = await getPayloadClient({
    initOptions: {
      express: app,
      onInit: async (cms) => {
        cms.logger.info(`Admin URL: ${cms.getAdminURL()}`);
      },
    },
  });

  // protect cart page, need to be logged in to see it
  const cartRouter = express.Router();
  cartRouter.use(payload.authenticate);
  cartRouter.get("/", (req, res) => {
    const request = req as PayloadRequest;
    if (!request.user) return res.redirect("/sign-in?origin=cart");

    const parsedUrl = parse(req.url, true);
    // need to tell next.js what to render when authenticated, which is the cart page
    return nextApp.render(req, res, "/cart", parsedUrl.query);
  });
  // use this middleware
  app.use("/cart", cartRouter);

  if (process.env.NEXT_BUILD) {
    app.listen(PORT, async () => {
      payload.logger.info("Next.js is building for production");
      // @ts-expect-error
      await nextBuild(path.join(__dirname, "../"));
      process.exit();
    });

    return;
  }

  // when we can a req to this endpoint, forward it to trpc in next.js
  app.use(
    "/api/trpc",
    trpcExpress.createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // for all the routes just forward it to next.js
  app.use((req, res) => nextHandler(req, res));

  nextApp.prepare().then(() => {
    payload.logger.info("Next.js started");

    app.listen(PORT, async () => {
      payload.logger.info(
        `Next.js App URL: ${process.env.NEXT_PUBLIC_SERVER_URL}`
      );
    });
  });
};

start();
