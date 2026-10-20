import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Amrutam Telemedicine API')
    .setDescription(
      'REST API for patients, doctors and admins: authentication, doctor search, availability, bookings, consultations, prescriptions, payments and admin analytics.',
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .addTag('auth')
    .addTag('users')
    .addTag('doctors')
    .addTag('availability')
    .addTag('bookings')
    .addTag('consultations')
    .addTag('prescriptions')
    .addTag('payments')
    .addTag('admin')
    .addTag('health')
    .build();
  return SwaggerModule.createDocument(app, config);
}

/** Swagger UI at /docs and raw spec at /docs-json. Development only. */
export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup('docs', app, buildOpenApiDocument(app), {
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: { persistAuthorization: true },
  });
}
