export const roles = ['Admin', 'Sales', 'Warehouse', 'Accounts'] as const;
export type UserRole = (typeof roles)[number];

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface PaginationQuery {
  page?: string;
  limit?: string;
}
