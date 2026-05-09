import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ExpenseCategoriesService } from './expense-categories.service.js';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto.js';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Sections } from '../common/decorators/roles.decorator.js';
import { AppSection } from '../users/app-section.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';

@Controller('expense-categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExpenseCategoriesController {
  constructor(private readonly categoriesService: ExpenseCategoriesService) {}

  @Get()
  findAll() {
    return this.categoriesService.findAllActive();
  }

  @Get('admin')
  @Sections(AppSection.EXPENSE_CATEGORIES)
  findAllAdmin() {
    return this.categoriesService.findAll();
  }

  @Post()
  @Sections(AppSection.EXPENSE_CATEGORIES)
  create(
    @Body() dto: CreateExpenseCategoryDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.categoriesService.create(dto, user.id);
  }

  @Patch(':id')
  @Sections(AppSection.EXPENSE_CATEGORIES)
  update(@Param('id') id: string, @Body() dto: UpdateExpenseCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @Sections(AppSection.EXPENSE_CATEGORIES)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}
