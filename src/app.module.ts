import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { Strat1Module } from './strategies/strat1/strat1.module';

@Module({
  imports: [ScheduleModule.forRoot(), Strat1Module],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
