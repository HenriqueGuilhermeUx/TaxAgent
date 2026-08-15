import { Controller, Get, Header, NotFoundException } from '@nestjs/common';
import { fiscalAutopilotHtml } from './autopilot.page';
import { companyCorrectionHtml } from './company-correction.page';
import { homologationConsoleHtml } from './homologation-console.page';

const UTC_DATE_INITIALIZER = "const today=new Date().toISOString().slice(0,10);$('effectiveAt').value=today;$('competence').value=today;";
const LOCAL_DATE_INITIALIZER = "const now=new Date();const pad=(n)=>String(n).padStart(2,'0');const today=now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate());$('effectiveAt').value=today;$('competence').value=today;if($('prepareKey'))$('prepareKey').value='prep-'+crypto.randomUUID();";
const STATE_OLD = "const state={companyId:'',apiKey:'',cityCode:'',taxDecisionId:'',lastInvoiceBody:null,dryRunValid:false};";
const STATE_NEW = "const state={companyId:'',apiKey:'',cityCode:'',taxDecisionId:'',preparedDpsId:'',lastInvoiceBody:null,dryRunValid:false};";
const DESTINATION_CITY_CONTROL = '<div><label>Município destino (IBGE)</label><input id="destinationCity" maxlength="7" /></div>';
const PROFILE_CONTROLS = `${DESTINATION_CITY_CONTROL}
      <div><label>Perfil de serviço</label><select id="serviceProfile" onchange="serviceProfileChanged()"><option value="">Manual / sem perfil</option><option value="business_consulting">Consultoria empresarial padrão (TaxAgent)</option></select></div>
      <div><label>Retenção ISS para a operação</label><select id="taxIssWithholding"><option value="">Confirmar antes de resolver</option><option value="1">1 · Não retido</option><option value="2">2 · Retido pelo tomador</option><option value="3">3 · Retido pelo intermediário</option></select></div>`;
const RESOLVE_FUNCTION_ANCHOR = '  window.resolveTax=async function(){';
const PROFILE_CHANGE_FUNCTION = `  window.serviceProfileChanged=function(){
    if(val('serviceProfile')==='business_consulting'){
      $('serviceCode').value='';$('operationIndicator').value='';$('cst').value='';$('taxClassification').value='';$('taxTreatment').value='standard';
      if(!$('serviceDescription').value)$('serviceDescription').value='Serviços de consultoria empresarial';
    }
  };

${RESOLVE_FUNCTION_ANCHOR}`;
const RESOLVE_BODY_OLD = "destination_city_code:val('destinationCity')||undefined,national_service_code:val('serviceCode')||undefined,operation_indicator:val('operationIndicator')||undefined,cst:val('cst')||undefined,tax_classification:val('taxClassification')||undefined,tax_treatment:val('taxTreatment')";
const RESOLVE_BODY_NEW = "destination_city_code:val('destinationCity')||undefined,service_profile:val('serviceProfile')||undefined,iss_withholding:val('taxIssWithholding')||undefined,national_service_code:val('serviceCode')||undefined,operation_indicator:val('operationIndicator')||undefined,cst:val('cst')||undefined,tax_classification:val('taxClassification')||undefined,tax_treatment:val('taxTreatment')";
const RESOLVED_ACTION_OLD = "if(result.status==='resolved'){state.taxDecisionId=result.id;$('invoiceAmount').value=val('taxAmount');syncStatus();}";
const RESOLVED_ACTION_NEW = "if(result.status==='resolved'){state.taxDecisionId=result.id;state.preparedDpsId='';$('invoiceAmount').value=val('taxAmount');if($('preparedDpsId'))$('preparedDpsId').value='';if(val('destinationCity'))$('customerCity').value=val('destinationCity');if(result.municipal_tax){if(result.municipal_tax.iss_taxation)$('issTaxation').value=String(result.municipal_tax.iss_taxation);if(result.municipal_tax.iss_withholding)$('issWithholding').value=String(result.municipal_tax.iss_withholding);if(result.municipal_tax.iss_rate!==undefined)$('issRate').value=String(result.municipal_tax.iss_rate);}syncStatus();}";
const ISS_RATE_CONTROL = '<div><label>Alíquota ISS (%) · quando aplicável</label><input id="issRate" type="number" step="0.01" min="0" max="9.99" /></div>';
const PREPARED_CONTROLS = `${ISS_RATE_CONTROL}
      <div><label>Prepared DPS · Idempotency-Key</label><input id="prepareKey" autocomplete="off" placeholder="prep-..." /></div>
      <div><label>Prepared DPS ID</label><input id="preparedDpsId" autocomplete="off" placeholder="pdps_..." /></div>`;
const DPS_ACTIONS_OLD = '<div class="actions"><button onclick="dryRunDps()">Build → XSD → A1 → XMLDSig → XSD</button></div>';
const DPS_ACTIONS_NEW = '<div class="actions"><button class="secondary" onclick="prebuildDps()">Preview sem persistir · Build → XSD</button><button class="secondary" onclick="preparePersistentDps()">Congelar Prepared DPS · sequência real + XSD</button><button class="secondary" onclick="loadPreparedDps()">Consultar Prepared DPS</button><button onclick="signPreparedDps()">Assinar Prepared DPS com A1</button><button onclick="dryRunDps()">Dry-run legado · reconstruir + A1</button></div>';
const DRYRUN_FUNCTION_ANCHOR = '  window.dryRunDps=async function(){';
const PREBUILD_FUNCTION = `  function restorePreparedPayload(result){
    const p=result&&result.resume_payload;if(!p)return;
    state.taxDecisionId=p.tax_decision_id||result.tax_decision_id||'';state.preparedDpsId=result.id||p.prepared_dps_id||'';state.lastInvoiceBody=p;
    if(p.competence)$('competence').value=p.competence;
    if(p.customer){$('customerTaxId').value=p.customer.tax_id||'';$('customerName').value=p.customer.name||'';$('customerCity').value=p.customer.city_code||'';}
    if(p.service){$('serviceDescription').value=p.service.description||'';$('invoiceAmount').value=String(p.service.amount??'');$('serviceLocation').value=p.service.service_location_city_code||'';$('issTaxation').value=p.service.iss_taxation||'1';$('issWithholding').value=p.service.iss_withholding||'1';$('issRate').value=p.service.iss_rate===undefined?'':String(p.service.iss_rate);}
    $('preparedDpsId').value=state.preparedDpsId;syncStatus();
  }

  window.prebuildDps=async function(){try{const body=buildInvoiceBody();delete body.prepared_dps_id;state.lastInvoiceBody=body;state.dryRunValid=false;show('dpsOut','Montando preview e validando XSD sem certificado...');const result=await request('/v1/operations/dps/prebuild',{method:'POST',body});show('dpsOut',result);}catch(e){show('dpsOut','ERRO: '+e.message);}};

  window.preparePersistentDps=async function(){try{const body=buildInvoiceBody();delete body.prepared_dps_id;const idem=val('prepareKey');if(!idem)throw new Error('Informe a Idempotency-Key do Prepared DPS');state.dryRunValid=false;show('dpsOut','Congelando sequência, dhEmi, competência, Tax Decision e XML...');const result=await request('/v1/operations/dps/prepare',{method:'POST',body,idempotencyKey:idem});restorePreparedPayload(result);show('dpsOut',result);}catch(e){show('dpsOut','ERRO: '+e.message);}};

  window.loadPreparedDps=async function(){try{const id=val('preparedDpsId')||state.preparedDpsId;if(!id)throw new Error('Informe o Prepared DPS ID');const result=await request('/v1/operations/dps/prepared/'+encodeURIComponent(id));restorePreparedPayload(result);state.dryRunValid=result.signed===true&&result.transmitted===false;show('dpsOut',result);}catch(e){show('dpsOut','ERRO: '+e.message);}};

  window.signPreparedDps=async function(){try{const id=val('preparedDpsId')||state.preparedDpsId;if(!id)throw new Error('Crie ou informe o Prepared DPS ID');show('dpsOut','Assinando exatamente o XML persistido, sem transmitir...');const result=await request('/v1/operations/dps/prepared/'+encodeURIComponent(id)+'/sign',{method:'POST'});restorePreparedPayload(result);state.dryRunValid=result.valid===true&&result.signed===true&&result.transmitted===false;show('dpsOut',result);}catch(e){show('dpsOut','ERRO: '+e.message);}};

${DRYRUN_FUNCTION_ANCHOR}`;
const LIVE_BODY_OLD = "const body=state.lastInvoiceBody||buildInvoiceBody();show('liveOut','Transmitindo uma única operação...');const result=await request('/v1/invoices',{method:'POST',body,idempotencyKey:idem});";
const LIVE_BODY_NEW = "const baseBody=state.lastInvoiceBody||buildInvoiceBody();const preparedId=state.preparedDpsId||val('preparedDpsId');const body={...baseBody,...(preparedId?{prepared_dps_id:preparedId}:{})};show('liveOut','Transmitindo uma única operação vinculada ao Prepared DPS...');const result=await request('/v1/invoices',{method:'POST',body,idempotencyKey:idem});";

export function prepareHomologationConsoleHtml(html: string): string {
  return html
    .replace(UTC_DATE_INITIALIZER, LOCAL_DATE_INITIALIZER)
    .replace(STATE_OLD, STATE_NEW)
    .replace(DESTINATION_CITY_CONTROL, PROFILE_CONTROLS)
    .replace(RESOLVE_FUNCTION_ANCHOR, PROFILE_CHANGE_FUNCTION)
    .replace(RESOLVE_BODY_OLD, RESOLVE_BODY_NEW)
    .replace(RESOLVED_ACTION_OLD, RESOLVED_ACTION_NEW)
    .replace(ISS_RATE_CONTROL, PREPARED_CONTROLS)
    .replace(DPS_ACTIONS_OLD, DPS_ACTIONS_NEW)
    .replace(DRYRUN_FUNCTION_ANCHOR, PREBUILD_FUNCTION)
    .replace(LIVE_BODY_OLD, LIVE_BODY_NEW);
}

export function useBrowserLocalDateDefaults(html: string): string {
  return prepareHomologationConsoleHtml(html);
}

@Controller('homologation')
export class HomologationConsoleController {
  private assertEnabled(): void {
    if (process.env.TAXAGENT_HOMOLOGATION_CONSOLE_ENABLED !== 'true') throw new NotFoundException();
  }

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('X-Frame-Options', 'DENY')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
  page(): string { this.assertEnabled(); return prepareHomologationConsoleHtml(homologationConsoleHtml()); }

  @Get('autopilot')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('X-Frame-Options', 'DENY')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
  autopilot(): string { this.assertEnabled(); return fiscalAutopilotHtml(); }

  @Get('company-correction')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('X-Frame-Options', 'DENY')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
  companyCorrection(): string { this.assertEnabled(); return companyCorrectionHtml(); }
}
