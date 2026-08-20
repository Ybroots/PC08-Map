import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { loadAndValidateConfig } from "@atgt/config";
import { config as loadEnvironmentFile } from "dotenv";
import { resolve } from "path";
import { configureHttpSecurity } from "./platform/http-security";

async function bootstrap() {
  loadEnvironmentFile({ path: resolve(__dirname, "../../../.env.local") });
  const config = loadAndValidateConfig();
  const app = await NestFactory.create(AppModule.register(config));
  configureHttpSecurity(app);

  // API prefix
  app.setGlobalPrefix("api/v1");

  await app.listen(config.app.port);
  console.log(`ATGT API running on port ${config.app.port}`);
}

void bootstrap();
