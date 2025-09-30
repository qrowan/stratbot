import { Module } from '@nestjs/common';
import { SS1Service } from './ss1.service';
import { SP1 } from 'src/protocols/sp1/sp1';
import { SS1Controller } from './ss1.controller';

@Module({
  controllers: [SS1Controller],
  providers: [SS1Service, SP1],
})
export class SS1Module { }