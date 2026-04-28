import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WbApiHttpService } from './wb-api-http.service.js';
import { WbApiCallLog } from './wb-api-call-log.entity.js';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([WbApiCallLog])],
  providers: [WbApiHttpService],
  exports: [WbApiHttpService],
})
export class WbApiModule {}
