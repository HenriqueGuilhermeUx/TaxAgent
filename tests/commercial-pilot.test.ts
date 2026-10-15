import assert from 'node:assert/strict';
import test from 'node:test';
import { CommercialPilotService } from '../src/customer-portal/commercial-pilot.service';

test('commercial pilot application returns a safe public receipt and never starts fiscal transmission', async () => {
  const queries:Array<{sql:string;params:unknown[]}> = [];
  const db={query:async(sql:string,params:unknown[]=[])=>{
    queries.push({sql,params});
    if(sql.includes('SELECT id, created_at')) return {rows:[],rowCount:0};
    if(sql.includes('INSERT INTO commercial_pilot_applications')) return {rows:[{id:'pilotapp_1',created_at:'2026-10-15T22:00:00Z'}],rowCount:1};
    return {rows:[],rowCount:0};
  }} as any;
  const service=new CommercialPilotService(db);
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
  const service=new CommercialPilotService(db);
  const result=await service.create({contact_name:'Maria',email:'maria@example.com',company_name:'Empresa',profile:'software',consent:true});
  assert.equal(result.application_id,'pilotapp_existing');
  assert.equal(result.deduplicated,true);
});