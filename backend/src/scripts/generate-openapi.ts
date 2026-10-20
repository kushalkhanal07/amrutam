/** Writes the OpenAPI spec to docs/openapi.json without starting the HTTP server. */
import { NestFactory } from '@nestjs/core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../app.module';
import { buildOpenApiDocument } from '../swagger';

async function main(): Promise<void> {
  process.env.NOTIFICATION_WORKER_ENABLED = 'false';
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.init();
  const document = buildOpenApiDocument(app);
  const outDir = join(process.cwd(), 'docs');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'openapi.json');
  writeFileSync(outFile, JSON.stringify(document, null, 2));
  await app.close();
  console.log(`OpenAPI spec written to ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
