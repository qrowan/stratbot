import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SS1Module } from './strategies/ss1/ss1.module';

@Module({
  imports: [ScheduleModule.forRoot(), SS1Module],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
