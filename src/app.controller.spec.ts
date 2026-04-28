import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  it('health returns ok', () => {
    const res = controller.health();
    expect(res.status).toBe('ok');
    expect(res.timestamp).toBeDefined();
  });
});
