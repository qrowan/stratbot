import { Controller, Post } from "@nestjs/common";
import { SS1Service } from "./ss1.service";
import { Get } from "@nestjs/common";

@Controller('ss1')
export class SS1Controller {
  constructor(private readonly ss1: SS1Service) { }

  @Get('get-positions')
  async getPositions() {
    return this.ss1.getPositions();
  }

  @Get('get-receipts')
  async getReceipts() {
    return this.ss1.getReceipts();
  }
}