import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AdminUser, AdminRole } from './admin-user.entity.js';
import { ALL_APP_SECTIONS } from './app-section.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(AdminUser)
    private readonly usersRepository: Repository<AdminUser>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedAdmin();
  }

  async findAll(): Promise<Omit<AdminUser, 'password_hash'>[]> {
    const users = await this.usersRepository.find();
    return users.map(({ password_hash, ...rest }) => rest);
  }

  async findOne(id: string): Promise<Omit<AdminUser, 'password_hash'>> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`);
    }
    const { password_hash, ...rest } = user;
    return rest;
  }

  async create(dto: CreateUserDto): Promise<Omit<AdminUser, 'password_hash'>> {
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = this.usersRepository.create({
      name: dto.name,
      username: dto.username,
      password_hash: hashedPassword,
      role: dto.role ?? AdminRole.VIEWER,
      allowed_sections:
        dto.role === AdminRole.ADMIN ? ALL_APP_SECTIONS : (dto.allowed_sections ?? []),
      telegram_id: dto.telegram_id ? String(dto.telegram_id) : null,
    });
    const saved = await this.usersRepository.save(user);
    const { password_hash, ...rest } = saved;
    return rest;
  }

  async update(
    id: string,
    dto: UpdateUserDto,
  ): Promise<Omit<AdminUser, 'password_hash'>> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`);
    }

    if (dto.name !== undefined) user.name = dto.name;
    if (dto.username !== undefined) user.username = dto.username;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.allowed_sections !== undefined) {
      user.allowed_sections = dto.allowed_sections;
    }
    if (user.role === AdminRole.ADMIN) {
      user.allowed_sections = ALL_APP_SECTIONS;
    }
    if (dto.telegram_id !== undefined)
      user.telegram_id = dto.telegram_id ? String(dto.telegram_id) : null;

    if (dto.password) {
      user.password_hash = await bcrypt.hash(dto.password, 10);
    }

    const saved = await this.usersRepository.save(user);
    const { password_hash, ...rest } = saved;
    return rest;
  }

  async remove(id: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`);
    }
    user.is_active = false;
    await this.usersRepository.save(user);
    await this.usersRepository.softDelete({ id: user.id });
  }

  async seedAdmin(): Promise<void> {
    const adminCount = await this.usersRepository.count({
      where: { role: AdminRole.ADMIN },
    });

    if (adminCount > 0) {
      return;
    }

    this.logger.log('No admin user found — creating default admin...');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const admin = this.usersRepository.create({
      name: 'Admin',
      username: 'admin',
      password_hash: hashedPassword,
      role: AdminRole.ADMIN,
      allowed_sections: ALL_APP_SECTIONS,
    });
    await this.usersRepository.save(admin);
    this.logger.log('Default admin user created (username: admin)');
  }
}
