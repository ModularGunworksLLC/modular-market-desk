import { z } from "zod";

export const monthQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export const incomeLineSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().min(1).max(120),
  plannedAmount: z.number(),
  payDay: z.number().int().min(1).max(31).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const budgetLineSchema = z.object({
  id: z.number().int().optional(),
  groupName: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  plannedAmount: z.number(),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  isSinkingFund: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateMonthSchema = z.object({
  incomeLines: z.array(incomeLineSchema),
  budgetLines: z.array(budgetLineSchema),
});

export const createTransactionSchema = z.object({
  monthId: z.number().int(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().negative(),
  payee: z.string().min(1).max(200),
  memo: z.string().max(500).optional(),
  budgetLineId: z.number().int().optional(),
});

export const assignTransactionSchema = z.object({
  splits: z.array(
    z.object({
      budgetLineId: z.number().int(),
      amount: z.number().positive(),
    }),
  ),
});
