import { SetMetadata } from '@nestjs/common';
import { AdminRole } from '../../users/admin-user.entity.js';
import { AppSection } from '../../users/app-section.js';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);

export const SECTIONS_KEY = 'sections';
export const Sections = (...sections: AppSection[]) =>
  SetMetadata(SECTIONS_KEY, sections);
