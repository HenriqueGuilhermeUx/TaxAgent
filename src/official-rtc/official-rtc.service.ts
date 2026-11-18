import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RtcOpenDataClient } from '../tax-engine/rtc-open-data.client';
import { OfficialRtcClient, officialRtcMode } from './official-rtc.client';
import { OFFICIAL_RTC_MANIFEST, OfficialRtcEngineId } from './official-rtc.manifest';
import { assessOfficialRtcObservability } from './official-rtc-observability';
import { assessOfficialRtcFreshness } from './official-rtc-freshness';

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function officialRtcInputSha256(payload: unknown): string {
  return createHash('sha256').update(stable(payload)).digest('hex');
}

@Injectable()
export class OfficialRtcService {
  constructor(private readonly client: OfficialRtcClient, private readonly reference: RtcOpenDataClient) {}

  status() {
    const mode = officialRtcMode();
    return {
      mode,
      authoritative: false,
      authoritative_requested: mode === 'official',
      engines: {
        regular: { ...OFFICIAL_RTC_MANIFEST.regular, configured: this.client.regularConfigured() },
        simples: { ...OFFICIAL_RTC_MANIFEST.simples, configured: this.client.simplesConfigured() },
        danfse: { ...OFFICIAL_RTC_MANIFEST.danfse, configured: this.client.danfseConfigured() },
      },
      policy: {
        ai_authoritative: false,
        official_engine_authoritative_only_when_mode_official: true,
        authoritative_requires_current_reference_version: true,
        raw_upstream_payload_persistable_for_audit: true,
      },
    };
  }

  async freshness() {
    try {
      const reference = await this.reference.getVersion();
      return {
        regular: assessOfficialRtcFreshness(OFFICIAL_RTC_MANIFEST.regular.upstreamRelease, reference.payload),
        source: { url: reference.url, fetched_at: reference.fetchedAt },
      };
    } catch (error) {
      return {
        regular: assessOfficialRtcFreshness(OFFICIAL_RTC_MANIFEST.regular.upstreamRelease, null),
        source: { error: error instanceof Error ? error.message : 'Official RTC reference version lookup failed' },
      };
    }
  }

  async calculate(engine: 'regular' | 'simples', payload: Record<string, unknown>) {
    this.assertCallable(engine);
    if (officialRtcMode() === 'official' && engine === 'regular') {
      const freshness = await this.freshness();
      if (!freshness.regular.authoritative_eligible) {
        throw new ServiceUnavailableException('Official RTC regular engine is not authoritative because the pinned open-source release does not match the current Receita reference version');
      }
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Object.keys(payload).length) {
      throw new BadRequestException('Official RTC payload must be a non-empty JSON object');
    }
    const inputSha256 = officialRtcInputSha256(payload);
    const result = engine === 'regular'
      ? await this.client.calculateRegular(payload, true)
      : await this.client.calculateSimples(payload);
    return {
      engine: OFFICIAL_RTC_MANIFEST[engine],
      mode: officialRtcMode(),
      input_sha256: inputSha256,
      calculated_at: new Date().toISOString(),
      assessment: assessOfficialRtcObservability(result),
      result,
    };
  }

  async renderDanfse(xml: string, state = '0', canhoto = true) {
    this.assertCallable('danfse');
    if (!xml.trim().startsWith('<')) throw new BadRequestException('Authorized NFS-e XML is required');
    const inputSha256 = createHash('sha256').update(xml).digest('hex');
    const pdf = await this.client.renderDanfse(xml, state, canhoto);
    return {
      engine: OFFICIAL_RTC_MANIFEST.danfse,
      mode: officialRtcMode(),
      input_sha256: inputSha256,
      output_sha256: createHash('sha256').update(pdf).digest('hex'),
      rendered_at: new Date().toISOString(),
      pdf,
    };
  }

  private assertCallable(engine: OfficialRtcEngineId): void {
    const mode = officialRtcMode();
    if (mode === 'off') throw new ServiceUnavailableException('Official RTC engine is disabled');
    const status = this.status().engines[engine];
    if (!status.configured) throw new ServiceUnavailableException(`Official RTC ${engine} engine is not configured`);
  }
}
