import { createApp } from "./app";
import { env } from "./config/env";

const app = createApp();

app.listen(env.port, () => {
  console.info(`survey-backend listening on port ${env.port}`);
});
