import { Controller, Get, Header, NotFoundException } from '@nestjs/common';
import { companyCorrectionHtml } from './company-correction.page';
import { homologationConsoleHtml } from './homologation-console.page';

const UTC_DATE_INITIALIZER = "const today=new Date().toISOString().slice(0,10);$('effectiveAt').value=today;$('competence').value=today;";
const LOCAL_DATE_INITIALIZER = "const now=new Date();const pad=(n)=>String(n).padStart(2,'0');const today=now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate());$('effectiveAt').value=today;$('competence').value=today;";
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
const RESOLVED_ACTION_NEW = "if(result.status==='resolved'){state.taxDecisionId=result.id;$('invoiceAmount').value=val('taxAmount');if(result.municipal_tax){if(result.municipal_tax.iss_taxation)$('issTaxation').value=String(result.municipal_tax.iss_taxation);if(result.municipal_tax.iss_withholding)$('issWithholding').value=String(result.municipal_tax.iss_withholding);if(result.municipal_tax.iss_rate!==undefined)$('issRate').value=String(result.municipal_tax.iss_rate);}syncStatus();}";

export function prepareHomologationConsoleHtml(html: string): string {
  return html
    .replace(UTC_DATE_INITIALIZER, LOCAL_DATE_INITIALIZER)
    .replace(DESTINATION_CITY_CONTROL, PROFILE_CONTROLS)
    .replace(RESOLVE_FUNCTION_ANCHOR, PROFILE_CHANGE_FUNCTION)
    .replace(RESOLVE_BODY_OLD, RESOLVE_BODY_NEW)
    .replace(RESOLVED_ACTION_OLD, RESOLVED_ACTION_NEW);
}

// Kept as a compatibility alias for existing tests/imports.
export function useBrowserLocalDateDefaults(html: string): string {
  return prepareHomologationConsoleHtml(html);
}

@Controller('homologation')
export class HomologationConsoleController {
  private assertEnabled(): void {
    if (process.env.TAXAGENT_HOMOLOGATION_CONSOLE_ENABLED !== 'true') {
      throw new NotFoundException();
    }
  }

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('X-Frame-Options', 'DENY')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
  page(): string {
    this.assertEnabled();
    return prepareHomologationConsoleHtml(homologationConsoleHtml());
  }

  @Get('company-correction')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('X-Frame-Options', 'DENY')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
  companyCorrection(): string {
    this.assertEnabled();
    return companyCorrectionHtml();
  }
}
