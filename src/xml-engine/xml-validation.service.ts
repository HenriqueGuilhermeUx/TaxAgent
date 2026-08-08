import { BadRequestException, Injectable } from '@nestjs/common';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { access } from 'node:fs/promises';

@Injectable()
export class XmlValidationService {
  async validateWellFormed(xml: string): Promise<void> {
    const result = XMLValidator.validate(xml);
    if (result !== true) throw new BadRequestException(`Malformed XML: ${result.err.msg}`);
    new XMLParser({ ignoreAttributes: false }).parse(xml);
  }

  async assertStrictSchemaAvailable(): Promise<string> {
    const path = process.env.TAXAGENT_NFSE_DPS_XSD;
    if (!path) throw new Error('TAXAGENT_NFSE_DPS_XSD is required for live transmission');
    await access(path);
    return path;
  }
}
