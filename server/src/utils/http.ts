import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { PaginationQuery } from '../types/index.js';

export class AppError extends Error {
  constructor(public status: number, message: string, public code = 'REQUEST_FAILED', public details?: unknown) {
    super(message);
  }
}

export const asyncHandler = (handler: RequestHandler): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(handler(req, res, next)).catch(next);

export const parsePagination = (query: PaginationQuery) => {
  const page = Math.max(1, Number.parseInt(query.page ?? '', 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit ?? '', 10) || 10));
  return { page, limit, offset: (page - 1) * limit };
};

export const paginated = <T>(rows: T[], total: number | string, page: number, limit: number) => ({
  data: rows,
  meta: { page, limit, total: Number(total), pages: Math.max(1, Math.ceil(Number(total) / limit)) },
});

export const ok = <T>(res: Response, data: T, status = 200) => res.status(status).json({ success: true, data });
