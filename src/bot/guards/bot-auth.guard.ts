import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class BotAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.configService.get<string>('BOT_API_SECRET');
    if (!secret?.trim()) {
      throw new UnauthorizedException('Bot API is not configured');
    }

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    const token =
      header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;

    if (!token || token !== secret) {
      throw new UnauthorizedException('Invalid bot credentials');
    }

    return true;
  }
}
