import { Controller, Post } from "@nestjs/common";
import { Strat1Service } from "./strat1.service";
import { Get } from "@nestjs/common";

@Controller('strat1')
export class Strat1Controller {
  constructor(private readonly strat1: Strat1Service) { }

  @Get('get-positions')
  async getPositions() {
    return this.strat1.getPositions();
  }

  @Get('get-receipts')
  async getReceipts() {
    return this.strat1.getReceipts();
  }
}