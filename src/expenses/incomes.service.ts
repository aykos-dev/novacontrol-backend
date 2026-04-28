import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExtraIncome } from './extra-income.entity.js';
import { CreateIncomeDto } from './dto/create-income.dto.js';
import { UpdateIncomeDto } from './dto/update-income.dto.js';

@Injectable()
export class IncomesService {
  constructor(
    @InjectRepository(ExtraIncome)
    private readonly incomeRepo: Repository<ExtraIncome>,
  ) {}

  async findAll(filters: {
    clientId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    data: ExtraIncome[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;

    const qb = this.incomeRepo
      .createQueryBuilder('income')
      .leftJoinAndSelect('income.client', 'client')
      .leftJoinAndSelect('income.creator', 'creator');

    if (filters.clientId) {
      qb.andWhere('income.client_id = :clientId', {
        clientId: filters.clientId,
      });
    }

    if (filters.dateFrom) {
      qb.andWhere('income.income_date >= :dateFrom', {
        dateFrom: filters.dateFrom,
      });
    }

    if (filters.dateTo) {
      qb.andWhere('income.income_date <= :dateTo', {
        dateTo: filters.dateTo,
      });
    }

    qb.orderBy('income.income_date', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }

  async create(dto: CreateIncomeDto, userId: string): Promise<ExtraIncome> {
    const row = this.incomeRepo.create({
      client_id: dto.client_id,
      income_date: dto.income_date,
      amount: String(dto.amount),
      currency: dto.currency ?? 'USD',
      note: dto.note ?? null,
      created_by: userId,
    });

    const saved = await this.incomeRepo.save(row);

    const full = await this.incomeRepo.findOne({
      where: { id: saved.id },
      relations: ['client', 'creator'],
    });

    return full ?? saved;
  }

  async update(id: string, dto: UpdateIncomeDto): Promise<ExtraIncome> {
    const income = await this.incomeRepo.findOne({ where: { id } });

    if (!income) {
      throw new NotFoundException(`Income with id "${id}" not found`);
    }

    if (dto.client_id !== undefined) income.client_id = dto.client_id;
    if (dto.income_date !== undefined) income.income_date = dto.income_date;
    if (dto.amount !== undefined) income.amount = String(dto.amount);
    if (dto.currency !== undefined) income.currency = dto.currency;
    if (dto.note !== undefined) income.note = dto.note;

    await this.incomeRepo.save(income);
    const reloaded = await this.incomeRepo.findOne({
      where: { id: income.id },
      relations: ['client', 'creator'],
    });
    return reloaded ?? income;
  }

  async remove(id: string): Promise<void> {
    const income = await this.incomeRepo.findOne({ where: { id } });

    if (!income) {
      throw new NotFoundException(`Income with id "${id}" not found`);
    }

    await this.incomeRepo.softRemove(income);
  }
}
