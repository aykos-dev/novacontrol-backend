import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AdminUser } from '../users/admin-user.entity.js';
import { validateTelegramWebAppData } from '../common/telegram/web-app-auth.util.js';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AdminUser)
    private readonly usersRepository: Repository<AdminUser>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateUser(
    username: string,
    password: string,
  ): Promise<Omit<AdminUser, 'password_hash'>> {
    const user = await this.usersRepository.findOne({
      where: { username, is_active: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { password_hash, ...result } = user;
    return result;
  }

  async login(user: Omit<AdminUser, 'password_hash'>): Promise<{ access_token: string }> {
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async getProfile(userId: string): Promise<Omit<AdminUser, 'password_hash'>> {
    const user = await this.usersRepository.findOne({
      where: { id: userId, is_active: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const { password_hash, ...result } = user;
    return result;
  }

  async loginWithTelegram(
    initData: string,
  ): Promise<{ access_token: string }> {
    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!botToken?.trim()) {
      throw new UnauthorizedException('Telegram bot is not configured');
    }

    const result = validateTelegramWebAppData(initData, botToken);
    if (!result.ok) {
      throw new UnauthorizedException(result.reason);
    }

    const user = await this.usersRepository.findOne({
      where: { telegram_id: result.userId, is_active: true },
    });

    if (!user) {
      throw new UnauthorizedException(
        'No admin user linked to this Telegram account. Ask an administrator to add your Telegram ID.',
      );
    }

    const { password_hash, ...safe } = user;
    return this.login(safe);
  }
}
