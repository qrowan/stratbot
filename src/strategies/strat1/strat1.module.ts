import { Module } from '@nestjs/common';
import { Strat1Service } from './strat1.service';
import { Strat1Controller } from './strat1';

@Module({
  controllers: [Strat1Controller],
  providers: [Strat1Service],
})
export class Strat1Module { }