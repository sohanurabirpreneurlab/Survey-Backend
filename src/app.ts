import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { errorHandler } from "./common/errors/error-handler";
import { notFound } from "./common/middleware/not-found";
import { requestId } from "./common/middleware/request-id";
import { adminRouter } from "./modules/admin/admin.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { healthRouter } from "./modules/health/health.routes";
import { organizationRouter } from "./modules/organizations/organization.routes";
import { respondentRouter } from "./modules/respondents/respondent.routes";
import { publicAccessRouter } from "./modules/respondents/public-access.routes";
import { responseRouter } from "./modules/responses/response.routes";
import { surveyRouter } from "./modules/surveys/survey.routes";
import { env } from "./config/env";

export const createApp = (): express.Express => {
  const app = express();

  morgan.token("safe-url", (request) => {
    const req = request as express.Request;
    return req.safeLogPath ?? req.originalUrl ?? req.url;
  });

  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      origin: (origin, callback) => {
        if (!origin || origin === env.appBaseUrl) {
          callback(null, true);
          return;
        }

        callback(null, false);
      }
    })
  );
  app.use(requestId);
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use((request, _response, next) => {
    request.safeLogPath = request.originalUrl.replace(/^\/i\/[^/?]+/, "/i/[redacted]");
    next();
  });
  app.use(
    morgan(':remote-addr - :remote-user [:date[clf]] ":method :safe-url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"', {
      stream: {
        write: (message: string) => {
          console.info(message.trim());
        }
      }
    })
  );

  app.get("/", (_request, response) => {
    response.status(200).json({
      success: true,
      message: "Survey backend is running.",
      data: {
        service: "survey-backend"
      },
      meta: {
        requestId: response.req.requestId ?? null
      }
    });
  });

  app.use("/api/v1/health", healthRouter);
  app.use(publicAccessRouter);
  app.use("/api/v1/admin", adminRouter);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/organizations", organizationRouter);
  app.use("/api/v1/respondent", respondentRouter);
  app.use("/api/v1/respondent/responses", responseRouter);
  app.use("/api/v1/surveys", surveyRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
};
