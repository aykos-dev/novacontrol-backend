import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExtraExpense } from './extra-expense.entity.js';
import { ExtraIncome } from './extra-income.entity.js';
import { ExpenseCategory } from './expense-category.entity.js';
import { ExpensesService } from './expenses.service.js';
import { ExpensesController } from './expenses.controller.js';
import { ExpenseCategoriesService } from './expense-categories.service.js';
import { ExpenseCategoriesController } from './expense-categories.controller.js';
import { IncomesService } from './incomes.service.js';
import { IncomesController } from './incomes.controller.js';
import { AlertsModule } from '../alerts/alerts.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExtraExpense, ExtraIncome, ExpenseCategory]),
    AlertsModule,
  ],
  providers: [ExpensesService, ExpenseCategoriesService, IncomesService],
  controllers: [
    ExpensesController,
    ExpenseCategoriesController,
    IncomesController,
  ],
  exports: [ExpensesService, IncomesService],
})
export class ExpensesModule {}
