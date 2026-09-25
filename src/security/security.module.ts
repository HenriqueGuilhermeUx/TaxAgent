import { Global, Module } from '@nestjs/common';
import { EnvelopeCryptoService } from './envelope-crypto.service';

@Global()
@Module({
  providers: [EnvelopeCryptoService],
  exports: [EnvelopeCryptoService],
})
export class SecurityModule {}
