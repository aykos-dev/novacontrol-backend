import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRole } from '../../users/admin-user.entity.js';
import { AppSection } from '../../users/app-section.js';
import { ROLES_KEY, SECTIONS_KEY } from '../decorators/roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AdminRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    const requiredSections = this.reflector.getAllAndOverride<AppSection[]>(
      SECTIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (
      (!requiredRoles || requiredRoles.length === 0) &&
      (!requiredSections || requiredSections.length === 0)
    ) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (user?.role === AdminRole.ADMIN) {
      return true;
    }

    if (requiredRoles?.length) {
      return requiredRoles.includes(user?.role);
    }

    const allowed = Array.isArray(user?.allowed_sections)
      ? user.allowed_sections
      : [];
    return requiredSections.every((section) => allowed.includes(section));
  }
}
