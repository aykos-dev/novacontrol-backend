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
import { Sections } from '../common/decorators/roles.decorator.js';
import { AppSection } from '../users/app-section.js';
import { SchedulerService } from './scheduler.service.js';
import { SCHEDULER_JOBS, isSchedulerJobId } from './scheduler-jobs.js';

@Controller('wb/scheduler')
@UseGuards(JwtAuthGuard, RolesGuard)
@Sections(AppSection.SETTINGS)
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  @Get('jobs')
  listJobs() {
    return SCHEDULER_JOBS;
  }

  @Post('jobs/:jobId/run')
  runJob(@Param('jobId') jobId: string) {
    if (!isSchedulerJobId(jobId)) {
      throw new BadRequestException(`Unknown job: ${jobId}`);
    }
    const { started } = this.schedulerService.runManualJobInBackground(jobId);
    return { ok: true as const, jobId, started };
  }
}
