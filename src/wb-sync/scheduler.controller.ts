import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { AdminRole } from '../users/admin-user.entity.js';
import { SchedulerService } from './scheduler.service.js';
import { SCHEDULER_JOBS, isSchedulerJobId } from './scheduler-jobs.js';

@Controller('wb/scheduler')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.ADMIN)
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  @Get('jobs')
  listJobs() {
    return SCHEDULER_JOBS;
  }

  @Post('jobs/:jobId/run')
  async runJob(@Param('jobId') jobId: string) {
    if (!isSchedulerJobId(jobId)) {
      throw new BadRequestException(`Unknown job: ${jobId}`);
    }
    await this.schedulerService.runManualJob(jobId);
    return { ok: true as const, jobId };
  }
}
