import { Injectable } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { DanfseModel, DanfseParty } from './danfse.types';

type Node = Record<string, unknown>;

function node(value: unknown): Node { return value && typeof value === 'object' && !Array.isArray(value) ? value as Node : {}; }
function path(root: unknown, keys: string[]): unknown { let current: unknown = root; for (const key of keys) current = node(current)[key]; return current; }
function text(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}
function at(root: unknown, dotted: string): string | undefined { return text(path(root, dotted.split('.'))); }
function first(...values: Array<string | undefined>): string | undefined { return values.find((value) => value !== undefined && value !== ''); }
function join(parts: Array<string | undefined>, separator = ' - '): string | undefined { const present = parts.filter((item): item is string => Boolean(item)); return present.length ? present.join(separator) : undefined; }

function party(source: unknown): DanfseParty {
  const addressNode = node(path(source, ['enderNac']));
  const genericAddress = Object.keys(addressNode).length ? addressNode : node(path(source, ['end']));
  const street = first(at(genericAddress, 'xLgr'), at(genericAddress, 'logradouro'));
  const number = first(at(genericAddress, 'nro'), at(genericAddress, 'numero'));
  const complement = first(at(genericAddress, 'xCpl'), at(genericAddress, 'complemento'));
  const district = first(at(genericAddress, 'xBairro'), at(genericAddress, 'bairro'));
  return {
    taxId: first(at(source, 'CNPJ'), at(source, 'CPF'), at(source, 'NIF')),
    municipalRegistration: first(at(source, 'IM'), at(source, 'inscMun')),
    phone: first(at(source, 'fone'), at(source, 'telefone')),
    name: first(at(source, 'xNome'), at(source, 'xNomeEmp')),
    municipality: first(at(genericAddress, 'xLoc'), at(genericAddress, 'xLocEmi'), at(source, 'xLoc')),
    uf: first(at(genericAddress, 'UF'), at(source, 'UF')),
    cityCode: first(at(genericAddress, 'cMun'), at(genericAddress, 'cLoc'), at(source, 'cMun')),
    cep: first(at(genericAddress, 'CEP'), at(source, 'CEP')),
    address: join([join([street, number], ', '), complement, district]),
    email: first(at(source, 'email'), at(source, 'xEmail')),
    simpleNational: first(at(source, 'regTrib.opSimpNac'), at(source, 'opSimpNac')),
    simpleRegime: first(at(source, 'regTrib.regApTribSN'), at(source, 'regApTribSN')),
  };
}

@Injectable()
export class DanfseParserService {
  parse(xml: string): DanfseModel {
    // Fiscal XML values must remain strings: auto-number parsing can destroy
    // decimal scale and leading zeros in official codes/identifiers.
    const parser = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      attributeNamePrefix: '@_',
      parseTagValue: false,
      parseAttributeValue: false,
      trimValues: true,
    });
    const parsed = parser.parse(xml) as Node;
    const nfse = node(parsed.NFSe ?? parsed.nfse ?? parsed);
    const inf = node(nfse.infNFSe ?? nfse.InfNFSe ?? nfse);
    const dpsEnvelope = node(inf.DPS ?? inf.dps);
    const dps = node(dpsEnvelope.infDPS ?? dpsEnvelope.InfDPS ?? dpsEnvelope);
    const emit = node(inf.emit);
    const emitAddress = node(emit.enderNac);
    const values = node(inf.valores);
    const ibs = node(inf.IBSCBS);
    const ibsValues = node(ibs.valores);
    const ibsTotals = node(ibs.totCIBS);
    const serv = node(dps.serv);
    const cServ = node(serv.cServ);
    const locPrest = node(serv.locPrest);
    const trib = node(node(dps.valores).trib);
    const tribMun = node(trib.tribMun);
    const tribFed = node(trib.tribFed);
    const serviceValues = node(node(dps.valores).vServPrest);
    const discounts = node(node(dps.valores).vDescCondIncond);

    const rawId = first(at(inf, '@_Id'), at(inf, 'id'), at(nfse, '@_Id'));
    const accessKey = rawId?.replace(/^NFS/i, '');
    const tpAmb = first(at(dps, 'tpAmb'), at(inf, 'tpAmb'));

    return {
      specVersion: 'NT008-1.02',
      environment: tpAmb === '2' ? 'test' : 'production',
      accessKey,
      number: first(at(inf, 'nNFSe'), at(inf, 'numero')),
      competence: first(at(dps, 'dCompet'), at(inf, 'dCompet')),
      issuedAt: first(at(inf, 'dhProc'), at(inf, 'dhEmi')),
      dpsNumber: first(at(dps, 'nDPS'), at(dps, 'numero')),
      dpsSeries: first(at(dps, 'serie'), at(dps, 'serieDPS')),
      dpsIssuedAt: at(dps, 'dhEmi'),
      issuer: first(at(emit, 'xNome'), at(inf, 'xLocEmi')),
      status: first(at(inf, 'xStatus'), at(inf, 'cStat')),
      purpose: first(at(inf, 'finNFSe'), at(dps, 'finNFSe')),
      issuerMunicipality: first(at(emitAddress, 'xLocEmi'), at(emitAddress, 'xLoc'), at(inf, 'xLocEmi')),
      issuerUf: first(at(emitAddress, 'UF'), at(inf, 'UF')),
      generator: first(at(inf, 'ambGer'), at(dps, 'verAplic')),
      provider: party(dps.prest),
      customer: party(dps.toma),
      recipient: party(dps.dest),
      intermediary: party(dps.interm),
      service: {
        nationalCode: at(cServ, 'cTribNac'),
        municipalCode: at(cServ, 'cTribMun'),
        nbs: first(at(cServ, 'cNBS'), at(serv, 'cNBS')),
        location: join([first(at(locPrest, 'xLocPrestacao'), at(locPrest, 'cLocPrestacao')), at(locPrest, 'UF')], ' / '),
        codeDescription: first(at(cServ, 'xDescServ'), at(cServ, 'xDescTribNac')),
        description: first(at(cServ, 'xDescServ'), at(serv, 'xDescServ')),
      },
      iss: {
        type: first(at(tribMun, 'tribISSQN'), at(inf, 'tribISSQN')),
        incidence: join([first(at(inf, 'xLocIncid'), at(tribMun, 'cLocIncid')), at(inf, 'UFIncid')], ' / '),
        specialRegime: at(tribMun, 'tpRetISSQN'),
        deductions: first(at(values, 'vDedRed'), at(tribMun, 'vDedRed')),
        base: first(at(values, 'vBC'), at(tribMun, 'vBC')),
        rate: first(at(values, 'pAliqAplic'), at(tribMun, 'pAliq')),
        retained: first(at(values, 'vISSQNRet'), at(tribMun, 'vISSQNRet')),
        amount: first(at(values, 'vISSQN'), at(tribMun, 'vISSQN')),
      },
      federal: {
        irrf: first(at(values, 'vIRRF'), at(tribFed, 'vIRRF')),
        previdencia: first(at(values, 'vRetCP'), at(tribFed, 'vRetCP')),
        sociais: first(at(values, 'vTotTribFed'), at(tribFed, 'vTotTribFed')),
        pis: first(at(tribFed, 'piscofins.vPIS'), at(values, 'vPIS')),
        cofins: first(at(tribFed, 'piscofins.vCOFINS'), at(values, 'vCOFINS')),
        description: at(tribFed, 'xDescRet'),
      },
      ibsCbs: {
        cstClass: join([at(ibs, 'CST'), at(ibs, 'cClassTrib')], ' / '),
        incidence: join([at(ibs, 'cIndOp'), at(ibs, 'cLocalidadeIncid'), at(ibs, 'xLocalidadeIncid'), at(ibs, 'UFIncid')], ' / '),
        exclusions: first(at(ibsValues, 'vCalcReeRepRes'), at(ibsValues, 'vISSQN')),
        base: at(ibsValues, 'vBC'),
        rateReduction: join([at(ibsValues, 'uf.pRedAliqUF'), at(ibsValues, 'mun.pRedAliqMun'), at(ibsValues, 'fed.pRedAliqCBS')], ' / '),
        rates: join([at(ibsValues, 'uf.pIBSUF'), at(ibsValues, 'mun.pIBSMun'), at(ibsValues, 'fed.pCBS')], ' / '),
        municipalEffectiveRate: at(ibsValues, 'mun.pAliqEfetMun'),
        municipalAmount: at(ibsTotals, 'gIBS.gIBSMunTot.vIBSMun'),
        stateEffectiveRate: at(ibsValues, 'uf.pAliqEfetUF'),
        stateAmount: at(ibsTotals, 'gIBS.gIBSUFTot.vIBSUF'),
        ibsTotal: at(ibsTotals, 'gIBS.vIBSTot'),
        cbsRate: at(ibsValues, 'fed.pCBS'),
        cbsEffectiveRate: at(ibsValues, 'fed.pAliqEfetCBS'),
        cbsTotal: at(ibsTotals, 'gCBS.vCBS'),
      },
      totals: {
        service: first(at(serviceValues, 'vServ'), at(values, 'vServ')),
        unconditionalDiscount: at(discounts, 'vDescIncond'),
        conditionalDiscount: at(discounts, 'vDescCond'),
        retentions: at(values, 'vTotalRet'),
        net: at(values, 'vLiq'),
        ibsCbs: first(at(ibsTotals, 'vTotTrib'), join([at(ibsTotals, 'gIBS.vIBSTot'), at(ibsTotals, 'gCBS.vCBS')], ' + ')),
        netPlusIbsCbs: at(ibsTotals, 'vTotNF'),
      },
      complementary: join([
        at(serv, 'infoCompl.xInfComp'),
        at(dps, 'subst.chSubstda') ? `NFS-e Subst.: ${at(dps, 'subst.chSubstda')}` : undefined,
        at(serv, 'obra.cObra') ? `Cod. Obra: ${at(serv, 'obra.cObra')}` : undefined,
        at(dps, 'IBSCBS.imovel.inscImobFisc') ? `Insc. Imob.: ${at(dps, 'IBSCBS.imovel.inscImobFisc')}` : undefined,
        at(serv, 'atvEvento.idAtvEvt') ? `Cod. Evt.: ${at(serv, 'atvEvento.idAtvEvt')}` : undefined,
      ], ' | '),
    };
  }
}
