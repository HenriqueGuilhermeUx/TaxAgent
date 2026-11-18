export type OfficialRtcEngineId = 'regular' | 'simples' | 'danfse';

export interface OfficialRtcEngineManifest {
  id: OfficialRtcEngineId;
  upstreamRepository: string;
  upstreamCommit: string;
  upstreamRelease: string;
  license: 'MIT';
  runtime: 'java21' | 'go1.27';
  purpose: string;
}

export const OFFICIAL_RTC_MANIFEST: Record<OfficialRtcEngineId, OfficialRtcEngineManifest> = {
  regular: {
    id: 'regular',
    upstreamRepository: 'ReceitaFederal/calculadora-rtc-regime-regular',
    upstreamCommit: '0accf834b76a2ce86ad1ad80ec61bbe070ae414e',
    upstreamRelease: '1.6.1',
    license: 'MIT',
    runtime: 'java21',
    purpose: 'CBS/IBS/IS calculation, official open-data tables and tax XML helpers for the regular regime',
  },
  simples: {
    id: 'simples',
    upstreamRepository: 'ReceitaFederal/calculadora-rtc-simples-nacional',
    upstreamCommit: 'c5b0f01c8351c3f0d0795cc617b29d233e9f98df',
    upstreamRelease: '0.0.6',
    license: 'MIT',
    runtime: 'java21',
    purpose: 'CBS/IBS calculation and activity rules for Simples Nacional',
  },
  danfse: {
    id: 'danfse',
    upstreamRepository: 'ReceitaFederal/calculadora-rtc-gerador-danfse',
    upstreamCommit: '8d79e6b2f7fad6375340afcb51c85ed370c64a14',
    upstreamRelease: '1.0.0',
    license: 'MIT',
    runtime: 'go1.27',
    purpose: 'Official DANFSe PDF rendering from authorized NFS-e XML',
  },
};
