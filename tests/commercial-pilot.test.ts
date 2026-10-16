import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { CommercialPilotService } from '../src/customer-portal/commercial-pilot.service';
import { commercialPilotOperationsHtml } from '../src/customer-portal/commercial-pilot.page';

test('commercial pilot application returns a safe public receipt and never starts fiscal transmission', async () => {
  const queries:Array<{sql:string;params:unknown[]}> = [];
  const db={query:async(sql:string,params:unknown[]=[])=>{
    queries.push({sql,params});
    if(sql.includes('SELECT id, created_at')) return {rows:[],rowCount:0};
    if(sql.includes('INSERT INTO commercial_pilot_applications')) return {rows:[{id:'pilotapp_1',created_at:'2026-10-15T22:00:00Z'}],rowCount:1};
    return {rows:[],rowCount:0};
  }} as any;
  const service=new CommercialPilotService(db,{ } as any);
  const result=await service.create({contact_name:'Maria',email:' MARIA@EXAMPLE.COM ',company_name:'Empresa',profile:'company',consent:true});
  assert.equal(result.status,'received');
  assert.equal(result.fiscal_transmission_attempted,false);
  assert.equal(queries[1]?.params[2],'maria@example.com');
  assert.equal(queries[1]?.params[8],undefined);
});

test('commercial pilot application deduplicates rapid identical submissions', async () => {
  const db={query:async(sql:string)=> sql.includes('SELECT id, created_at')
    ? {rows:[{id:'pilotapp_existing',created_at:'2026-10-15T22:00:00Z'}],rowCount:1}
    : {rows:[],rowCount:0}} as any;
  const service=new CommercialPilotService(db,{} as any);
  const result=await service.create({contact_name:'Maria',email:'maria@example.com',company_name:'Empresa',profile:'software',consent:true});
  assert.equal(result.application_id,'pilotapp_existing');
  assert.equal(result.deduplicated,true);
});

test('qualified commercial application converts idempotently into a TEST pilot enrollment without transmission', async () => {
  const application:any={id:'pilotapp_1',status:'qualified',contact_name:'Maria',email:'maria@example.com',phone:null,company_name:'Empresa LTDA',tax_id:'12.345.678/0001-90',profile:'company',message:null,source:'taxagent-site',internal_note:null,company_id:null,enrollment_id:null,pilot_environment:null,converted_at:null,created_at:'2026-10-15T22:00:00Z',updated_at:'2026-10-15T22:00:00Z'};
  let updated=false; let enrollArgs:any=null;
  const db={query:async(sql:string,params:unknown[]=[])=>{
    if(sql.includes('FROM commercial_pilot_applications WHERE id=$1')) return {rows:[application],rowCount:1};
    if(sql.includes("SET status='accepted'")) {updated=true; return {rows:[{...application,status:'accepted',company_id:'comp_1',enrollment_id:'pilot_1',pilot_environment:'test',converted_at:'2026-10-15T23:00:00Z'}],rowCount:1};}
    return {rows:[],rowCount:0};
  }} as any;
  const enrollment={enroll:async(dto:any,environment:string)=>{enrollArgs={dto,environment};return {company:{id:'comp_1'},enrollment:{id:'pilot_1'},pilot_status:'ACTION_REQUIRED',blockers:['active_a1'],checklist:[],next_actions:[],links:{}};}} as any;
  const service=new CommercialPilotService(db,enrollment);
  const result=await service.convertToPilot('pilotapp_1',{city_code:'3548500',tax_regime:'regular'});
  assert.equal(updated,true);
  assert.equal(enrollArgs.environment,'test');
  assert.equal(enrollArgs.dto.source,'commercial:pilotapp_1');
  assert.equal(result.company_id,'comp_1');
  assert.equal(result.enrollment_id,'pilot_1');
  assert.equal(result.safeguards.fiscal_transmission_attempted,false);
  assert.equal(result.safeguards.live_enabled_by_conversion,false);
});

test('commercial conversion refuses unqualified lead', async () => {
  const app:any={id:'pilotapp_1',status:'new',contact_name:'Maria',email:'maria@example.com',company_name:'Empresa',tax_id:'12345678000190',profile:'company',company_id:null,enrollment_id:null};
  const db={query:async()=>({rows:[app],rowCount:1})} as any;
  const service=new CommercialPilotService(db,{} as any);
  await assert.rejects(()=>service.convertToPilot('pilotapp_1',{city_code:'3548500',tax_regime:'regular'}),BadRequestException);
});

test('internal commercial console never persists bootstrap token in browser storage', () => {
  const html=commercialPilotOperationsHtml();
  assert.match(html,/Commercial Pilot Operations/);
  assert.match(html,/convert-to-pilot/);
  assert.doesNotMatch(html,/localStorage|sessionStorage/);
  assert.match(html,/fiscal transmission/i);
});
