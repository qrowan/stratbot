import { Controller, Post } from "@nestjs/common";
import { Strat1Service } from "./strat1.service";
import { Get } from "@nestjs/common";

@Controller('Strat1')
export class Strat1Controller {
  constructor(private readonly Strat1: Strat1Service) { }

  @Get('get-positions')
  async getPositions() {
    return this.Strat1.getPositions();
  }

  @Get('get-receipts')
  async getReceipts() {
    return this.Strat1.getReceipts();
  }
}