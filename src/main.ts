import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable graceful shutdown hooks
  app.enableShutdownHooks();

  const gracefulShutdown = async (signal: string) => {
    console.log(`Received ${signal} - initiating graceful shutdown...`);
    await app.close();
    process.exit(0);
  };

  // Handle shutdown signals gracefully
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  await app.listen(process.env.PORT ?? 8080);
  console.log(`Application is running on port ${process.env.PORT ?? 8080}`);
}
bootstrap();

if (!globalThis.crypto) {
  globalThis.crypto = require('crypto');
}