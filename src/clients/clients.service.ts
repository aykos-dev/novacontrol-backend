import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Client } from './client.entity.js';
import { WbApiHttpService } from '../common/wb-api/wb-api-http.service.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';
import { encrypt, decrypt } from '../common/crypto/crypto.util.js';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientsRepository: Repository<Client>,
    private readonly configService: ConfigService,
    private readonly wbApiHttp: WbApiHttpService,
  ) {}

  private get encryptionKey(): string {
    return this.configService.getOrThrow<string>('WB_TOKEN_ENCRYPTION_KEY');
  }

  private maskToken(token: string): string {
    if (token.length <= 8) {
      return '****';
    }
    return token.substring(0, 8) + '****';
  }

  private maskClientToken(client: Client): Client {
    return {
      ...client,
      wb_token: this.maskToken(client.wb_token),
    };
  }

  async findAll(): Promise<Client[]> {
    const clients = await this.clientsRepository.find({
      where: { is_active: true },
    });
    return clients.map((client) => this.maskClientToken(client));
  }

  async findOne(id: string): Promise<Client> {
    const client = await this.clientsRepository.findOne({
      where: { id, is_active: true },
    });
    if (!client) {
      throw new NotFoundException(`Client with id "${id}" not found`);
    }
    return this.maskClientToken(client);
  }

  async findOneWithToken(id: string): Promise<Client> {
    const client = await this.clientsRepository.findOne({
      where: { id, is_active: true },
    });
    if (!client) {
      throw new NotFoundException(`Client with id "${id}" not found`);
    }
    return {
      ...client,
      wb_token: decrypt(client.wb_token, this.encryptionKey),
    };
  }

  async create(dto: CreateClientDto): Promise<Client> {
    // Validate the WB token by making a test API call
    try {
      await this.wbApiHttp.get(
        'https://common-api.wildberries.ru/api/v1/seller-info',
        {
          headers: { Authorization: dto.wb_token },
        },
      );
    } catch {
      throw new BadRequestException(
        'Invalid WB token: failed to authenticate with Wildberries API',
      );
    }

    const encryptedToken = encrypt(dto.wb_token, this.encryptionKey);

    const client = this.clientsRepository.create({
      name: dto.name,
      wb_token: encryptedToken,
      currency: dto.currency ?? 'RUB',
      balance_alert_threshold: dto.balance_alert_threshold?.toString() ?? null,
    });

    const saved = await this.clientsRepository.save(client);
    return this.maskClientToken(saved);
  }

  async update(id: string, dto: UpdateClientDto): Promise<Client> {
    const client = await this.clientsRepository.findOne({
      where: { id, is_active: true },
    });
    if (!client) {
      throw new NotFoundException(`Client with id "${id}" not found`);
    }

    if (dto.name !== undefined) {
      client.name = dto.name;
    }
    if (dto.wb_token !== undefined) {
      client.wb_token = encrypt(dto.wb_token, this.encryptionKey);
    }
    if (dto.currency !== undefined) {
      client.currency = dto.currency;
    }
    if (dto.balance_alert_threshold !== undefined) {
      client.balance_alert_threshold =
        dto.balance_alert_threshold?.toString() ?? null;
    }

    const saved = await this.clientsRepository.save(client);
    return this.maskClientToken(saved);
  }

  async remove(id: string): Promise<void> {
    const client = await this.clientsRepository.findOne({
      where: { id, is_active: true },
    });
    if (!client) {
      throw new NotFoundException(`Client with id "${id}" not found`);
    }

    client.is_active = false;
    await this.clientsRepository.save(client);
    await this.clientsRepository.softDelete({ id: client.id });
  }
}
