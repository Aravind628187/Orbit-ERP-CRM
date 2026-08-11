import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/http.js';

export const notFound: RequestHandler = (req, _res, next) => next(new AppError(404, `Route ${req.method} ${req.originalUrl} was not found.`, 'ROUTE_NOT_FOUND'));

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof ZodError) {
    return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Please correct the highlighted fields.', details: error.flatten().fieldErrors } });
  }
  const databaseError = error as { code?: string };
  if (databaseError.code === '23505') return res.status(409).json({ success: false, error: { code: 'DUPLICATE_VALUE', message: 'A record with that unique value already exists.' } });
  if (databaseError.code === '22P02') return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid record identifier.' } });
  const appError = error instanceof AppError ? error : new AppError(500, 'An unexpected server error occurred.', 'INTERNAL_ERROR');
  if (appError.status >= 500) console.error(error);
  return res.status(appError.status).json({ success: false, error: { code: appError.code, message: appError.status >= 500 ? 'An unexpected server error occurred.' : appError.message, details: appError.details } });
};
