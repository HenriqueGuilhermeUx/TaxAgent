export function homologationConsoleHtml(): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="robots" content="noindex,nofollow,noarchive" />
  <title>TaxAgent · Homologação</title>
  <style>
    :root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#151515;background:#f5f5f2}*{box-sizing:border-box}body{margin:0}.wrap{max-width:1050px;margin:0 auto;padding:32px 18px 72px}header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:24px}h1{margin:0;font-size:30px}h2{margin:0 0 16px;font-size:20px}.muted{color:#666}.badge{display:inline-block;padding:5px 9px;border-radius:999px;background:#fff3cd;font-size:12px;font-weight:700}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.full{grid-column:1/-1}.card{background:#fff;border:1px solid #deded8;border-radius:16px;padding:20px;margin:14px 0;box-shadow:0 1px 2px rgba(0,0,0,.03)}label{display:block;font-size:12px;font-weight:700;color:#444;margin-bottom:5px}input,select,textarea,button{font:inherit}input,select,textarea{width:100%;border:1px solid #cfcfc8;border-radius:9px;padding:10px 11px;background:#fff}textarea{min-height:92px;resize:vertical}input[type=file]{padding:8px}button{border:0;border-radius:9px;padding:10px 14px;background:#111;color:#fff;font-weight:700;cursor:pointer}button.secondary{background:#ecece7;color:#111}button.danger{background:#8a1c1c}button:disabled{opacity:.45;cursor:not-allowed}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.out{white-space:pre-wrap;word-break:break-word;background:#111;color:#d7f9d7;border-radius:10px;padding:12px;min-height:54px;max-height:330px;overflow:auto;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace}.ok{color:#176b2c;font-weight:700}.err{color:#9d1b1b;font-weight:700}.secret{background:#fff7e6;border:1px solid #ead7a7;padding:10px 12px;border-radius:10px;margin:10px 0}.step{font-size:12px;font-weight:800;color:#777;text-transform:uppercase;letter-spacing:.08em}.row{display:flex;gap:8px;align-items:center}.row input{flex:1}.small{font-size:12px}.lock{border:1px solid #e3b9b9;background:#fff8f8}.status{margin-top:8px;font-size:13px}@media(max-width:760px){.grid{grid-template-columns:1fr}.full{grid-column:auto}header{display:block}header a{display:inline-block;margin-top:12px}}
  </style>
</head>
<body>
<div class="wrap">
  <header>
    <div><div class="step">Ferramenta interna</div><h1>TaxAgent · Console de Homologação</h1><p class="muted">Fluxo browser-only para preparar a primeira NFS-e em Produção Restrita.</p></div>
    <div><span class="badge">TEST / PRODUÇÃO RESTRITA</span><br/><a href="/docs" target="_blank" rel="noreferrer">Abrir Swagger</a></div>
  </header>

  <div class="card">
    <div class="step">0 · Sessão</div><h2>Acesso temporário</h2>
    <p class="muted small">Nada abaixo é salvo em localStorage/sessionStorage. Atualizar a página limpa os segredos da aba.</p>
    <div class="grid">
      <div><label>Bootstrap token</label><input id="bootstrap" type="password" autocomplete="off" placeholder="TAXAGENT_BOOTSTRAP_TOKEN" /></div>
      <div><label>Company ID existente (opcional)</label><input id="existingCompany" autocomplete="off" placeholder="comp_..." /></div>
      <div><label>API key de teste existente (opcional)</label><input id="existingKey" type="password" autocomplete="off" placeholder="ta_test_..." /></div>
      <div><label>Código IBGE emissor existente (se retomando)</label><input id="existingCity" maxlength="7" placeholder="3550308" /></div>
    </div>
    <div class="actions"><button class="secondary" onclick="useExisting()">Usar Company/API key existentes</button></div>
    <div id="sessionStatus" class="status muted">Nenhuma Company ativa nesta aba.</div>
  </div>

  <div class="card">
    <div class="step">1 · Empresa</div><h2>Criar empresa de homologação</h2>
    <div class="grid">
      <div><label>Nome da organização</label><input id="orgName" value="TaxAgent Homologação" /></div>
      <div><label>Razão social</label><input id="companyName" placeholder="Empresa LTDA" /></div>
      <div><label>CNPJ</label><input id="taxId" maxlength="32" placeholder="00000000000000" /></div>
      <div><label>Código IBGE do município</label><input id="cityCode" maxlength="7" placeholder="3550308" /></div>
      <div><label>Inscrição Municipal</label><input id="municipalRegistration" placeholder="se aplicável" /></div>
      <div><label>Regime tributário</label><select id="taxRegime"><option value="regular">Regular (ciclo suportado)</option></select></div>
    </div>
    <div class="actions"><button onclick="bootstrapCompany()">Criar Organization + Company + chave TEST</button></div>
    <div class="secret"><b>API key:</b> ela é exibida uma única vez. Copie e guarde em local seguro; a Console mantém apenas na memória da aba.</div>
    <div class="row"><input id="createdKey" type="password" readonly placeholder="será exibida aqui"/><button class="secondary" onclick="copyCreatedKey()">Copiar</button></div>
    <pre id="companyOut" class="out">Aguardando...</pre>
  </div>

  <div class="card">
    <div class="step">2 · Certificado</div><h2>Enviar A1 diretamente do navegador</h2>
    <div class="grid">
      <div><label>Arquivo A1 (.pfx/.p12)</label><input id="a1File" type="file" accept=".pfx,.p12,application/x-pkcs12" /></div>
      <div><label>Senha do A1</label><input id="a1Password" type="password" autocomplete="new-password" /></div>
    </div>
    <p class="muted small">O backend valida chave privada, validade e CNPJ do certificado contra a Company antes de cifrar no Vault.</p>
    <div class="actions"><button onclick="uploadA1()">Enviar A1 ao Certificate Vault</button></div>
    <pre id="a1Out" class="out">Aguardando...</pre>
  </div>

  <div class="card">
    <div class="step">3 · Rede</div><h2>Preflight sem emitir nota</h2>
    <p class="muted">Executa readiness, handshake mTLS com a SEFIN configurada e consulta de parâmetros municipais. Nenhuma DPS é enviada.</p>
    <div class="actions"><button onclick="runPreflight()">Executar preflight</button></div>
    <pre id="preflightOut" class="out">Aguardando...</pre>
  </div>

  <div class="card">
    <div class="step">4 · Tributação</div><h2>Resolver Tax Decision</h2>
    <div class="grid">
      <div><label>Data efetiva</label><input id="effectiveAt" type="date" /></div>
      <div><label>Valor</label><input id="taxAmount" type="number" step="0.01" min="0.01" value="100.00" /></div>
      <div><label>Município emissor (IBGE)</label><input id="issuerCity" maxlength="7" /></div>
      <div><label>Município destino (IBGE)</label><input id="destinationCity" maxlength="7" /></div>
      <div><label>cTribNac</label><input id="serviceCode" maxlength="6" placeholder="010201" /></div>
      <div><label>cIndOp</label><input id="operationIndicator" placeholder="cIndOp" /></div>
      <div><label>CST IBS/CBS</label><input id="cst" placeholder="000" /></div>
      <div><label>cClassTrib</label><input id="taxClassification" placeholder="000001" /></div>
      <div><label>Tratamento</label><select id="taxTreatment"><option value="standard">standard</option><option value="differentiated">differentiated</option><option value="special">special</option><option value="unknown">unknown</option></select></div>
    </div>
    <div class="actions"><button onclick="resolveTax()">Resolver e persistir decisão</button></div>
    <div class="status">Tax Decision ativa: <b id="decisionLabel">nenhuma</b></div>
    <pre id="taxOut" class="out">Aguardando...</pre>
  </div>

  <div class="card">
    <div class="step">5 · DPS</div><h2>Dry-run real com A1, sem transmissão</h2>
    <div class="grid">
      <div><label>Competência</label><input id="competence" type="date" /></div>
      <div><label>Tax Decision ID</label><input id="taxDecisionId" readonly placeholder="taxdec_..." /></div>
      <div><label>CPF/CNPJ do tomador</label><input id="customerTaxId" /></div>
      <div><label>Nome do tomador</label><input id="customerName" /></div>
      <div><label>Município do tomador (IBGE)</label><input id="customerCity" maxlength="7" /></div>
      <div><label>Município da prestação (IBGE)</label><input id="serviceLocation" maxlength="7" /></div>
      <div class="full"><label>Descrição do serviço</label><textarea id="serviceDescription"></textarea></div>
      <div><label>Valor do serviço</label><input id="invoiceAmount" type="number" step="0.01" min="0.01" value="100.00" /></div>
      <div><label>ISS · tributação (tribISSQN)</label><select id="issTaxation"><option value="1">1 · Tributável</option><option value="2">2 · Imunidade</option><option value="3">3 · Exportação</option><option value="4">4 · Não incidência</option></select></div>
      <div><label>ISS · retenção (tpRetISSQN)</label><select id="issWithholding"><option value="1">1 · Não retido</option><option value="2">2 · Retido pelo tomador</option><option value="3">3 · Retido pelo intermediário</option></select></div>
      <div><label>Alíquota ISS (%) · quando aplicável</label><input id="issRate" type="number" step="0.01" min="0" max="9.99" /></div>
    </div>
    <div class="actions"><button onclick="dryRunDps()">Build → XSD → A1 → XMLDSig → XSD</button></div>
    <pre id="dpsOut" class="out">Aguardando...</pre>
  </div>

  <div class="card lock">
    <div class="step">6 · Bloqueado por segurança</div><h2>Primeira transmissão em Produção Restrita</h2>
    <p class="muted">Só use depois de o dry-run retornar <b>valid=true</b> e o runtime estar com os gates live explicitamente habilitados.</p>
    <div class="grid">
      <div><label>Idempotency-Key única</label><input id="idempotencyKey" autocomplete="off" placeholder="first-real-dps-..." /></div>
      <div><label>Confirmação exata</label><input id="liveConfirmation" autocomplete="off" placeholder="YES-I-UNDERSTAND-THIS-SENDS-A-REAL-DPS" /></div>
    </div>
    <div class="actions"><button class="danger" onclick="sendFirstInvoice()">Transmitir UMA DPS real</button></div>
    <pre id="liveOut" class="out">Aguardando gates de homologação...</pre>
  </div>
</div>
<script>
(function(){
  'use strict';
  const state={companyId:'',apiKey:'',cityCode:'',taxDecisionId:'',lastInvoiceBody:null,dryRunValid:false};
  const $=(id)=>document.getElementById(id);
  const val=(id)=>String($(id).value||'').trim();
  const show=(id,value)=>{$(id).textContent=typeof value==='string'?value:JSON.stringify(value,null,2)};
  const today=new Date().toISOString().slice(0,10);$('effectiveAt').value=today;$('competence').value=today;

  async function request(path,options){
    const opts=options||{};const headers={accept:'application/json'};
    if(opts.bootstrap){const token=val('bootstrap');if(!token)throw new Error('Informe o bootstrap token');headers['x-taxagent-bootstrap-token']=token;}
    if(opts.bearer!==false){if(!state.apiKey)throw new Error('Nenhuma API key ativa nesta aba');headers.authorization='Bearer '+state.apiKey;}
    let body;
    if(opts.form){body=opts.form;} else if(opts.body!==undefined){headers['content-type']='application/json';body=JSON.stringify(opts.body);}
    if(opts.idempotencyKey)headers['idempotency-key']=opts.idempotencyKey;
    const response=await fetch(path,{method:opts.method||'GET',headers,body,cache:'no-store',credentials:'same-origin'});
    const raw=await response.text();let parsed=raw;try{parsed=raw?JSON.parse(raw):{};}catch(e){}
    if(!response.ok)throw new Error('HTTP '+response.status+' · '+(typeof parsed==='string'?parsed.slice(0,1500):JSON.stringify(parsed)));
    return parsed;
  }
  function requireCompany(){if(!state.companyId)throw new Error('Crie ou informe uma Company primeiro');}
  function syncStatus(){
    $('sessionStatus').textContent=state.companyId?'Company ativa: '+state.companyId+' · API key '+(state.apiKey?'carregada':'ausente'):'Nenhuma Company ativa nesta aba.';
    if(state.cityCode){$('issuerCity').value=state.cityCode;$('serviceLocation').value=state.cityCode;$('customerCity').value=$('customerCity').value||state.cityCode;$('destinationCity').value=$('destinationCity').value||state.cityCode;}
    $('taxDecisionId').value=state.taxDecisionId;$('decisionLabel').textContent=state.taxDecisionId||'nenhuma';
  }
  window.useExisting=function(){state.companyId=val('existingCompany');state.apiKey=val('existingKey');state.cityCode=val('existingCity');syncStatus();};
  window.copyCreatedKey=async function(){const key=$('createdKey').value;if(!key)return;await navigator.clipboard.writeText(key);};

  window.bootstrapCompany=async function(){
    try{
      show('companyOut','Criando...');
      const org=await request('/v1/organizations',{method:'POST',bootstrap:true,bearer:false,body:{name:val('orgName')}});
      const company=await request('/v1/organizations/'+encodeURIComponent(org.id)+'/companies',{method:'POST',bootstrap:true,bearer:false,body:{name:val('companyName'),tax_id:val('taxId'),city_code:val('cityCode'),municipal_registration:val('municipalRegistration')||undefined,tax_regime:val('taxRegime')}});
      const key=await request('/v1/companies/'+encodeURIComponent(company.id)+'/api-keys',{method:'POST',bootstrap:true,bearer:false,body:{name:'Homologation Console',environment:'test',scopes:['*']}});
      state.companyId=company.id;state.apiKey=key.key;state.cityCode=company.city_code;$('createdKey').value=key.key;syncStatus();
      show('companyOut',{organization:{id:org.id,name:org.name},company,api_key:{id:key.id,environment:key.environment,scopes:key.scopes,note:'secret displayed only in field above'}});
    }catch(e){show('companyOut','ERRO: '+e.message);}
  };

  window.uploadA1=async function(){
    try{requireCompany();const file=$('a1File').files[0];const password=val('a1Password');if(!file)throw new Error('Selecione o .pfx/.p12');if(!password)throw new Error('Informe a senha do A1');const form=new FormData();form.append('file',file);form.append('password',password);show('a1Out','Enviando e validando...');const result=await request('/v1/companies/'+encodeURIComponent(state.companyId)+'/certificates/upload',{method:'POST',form});$('a1Password').value='';$('a1File').value='';show('a1Out',result);}catch(e){show('a1Out','ERRO: '+e.message);}
  };

  window.runPreflight=async function(){try{requireCompany();show('preflightOut','Executando...');const result=await request('/v1/operations/readiness/'+encodeURIComponent(state.companyId)+'/probe?environment=test',{method:'POST'});show('preflightOut',result);}catch(e){show('preflightOut','ERRO: '+e.message);}};

  window.resolveTax=async function(){
    try{requireCompany();const body={company_id:state.companyId,effective_at:val('effectiveAt'),amount:Number(val('taxAmount')),issuer_city_code:val('issuerCity'),destination_city_code:val('destinationCity')||undefined,national_service_code:val('serviceCode')||undefined,operation_indicator:val('operationIndicator')||undefined,cst:val('cst')||undefined,tax_classification:val('taxClassification')||undefined,tax_treatment:val('taxTreatment')};show('taxOut','Resolvendo...');const result=await request('/v1/tax/resolve',{method:'POST',body});if(result.status==='resolved'){state.taxDecisionId=result.id;$('invoiceAmount').value=val('taxAmount');syncStatus();}show('taxOut',result);}catch(e){show('taxOut','ERRO: '+e.message);}
  };

  function buildInvoiceBody(){
    requireCompany();if(!state.taxDecisionId)throw new Error('Resolva a Tax Decision primeiro');
    const rate=val('issRate');return {company_id:state.companyId,environment:'test',competence:val('competence'),tax_decision_id:state.taxDecisionId,customer:{tax_id:val('customerTaxId'),name:val('customerName'),city_code:val('customerCity')},service:{description:val('serviceDescription'),amount:Number(val('invoiceAmount')),service_location_city_code:val('serviceLocation'),iss_taxation:val('issTaxation'),iss_withholding:val('issWithholding'),iss_rate:rate===''?undefined:Number(rate)}};
  }

  window.dryRunDps=async function(){try{const body=buildInvoiceBody();state.lastInvoiceBody=body;state.dryRunValid=false;show('dpsOut','Validando sem transmitir...');const result=await request('/v1/operations/dps/validate',{method:'POST',body});state.dryRunValid=result.valid===true&&result.transmitted===false;show('dpsOut',result);}catch(e){show('dpsOut','ERRO: '+e.message);}};

  window.sendFirstInvoice=async function(){
    try{
      if(!state.dryRunValid)throw new Error('Execute um dry-run válido nesta aba antes da transmissão');
      const confirmation=val('liveConfirmation');if(confirmation!=='YES-I-UNDERSTAND-THIS-SENDS-A-REAL-DPS')throw new Error('Confirmação exata não informada');
      const idem=val('idempotencyKey');if(!idem)throw new Error('Informe uma Idempotency-Key única e persistente');
      const readiness=await request('/v1/operations/readiness/'+encodeURIComponent(state.companyId)+'/probe?environment=test',{method:'POST'});if(readiness.ready_for_transmission!==true){show('liveOut',readiness);throw new Error('Readiness não está 100% verde; transmissão recusada');}
      const body=state.lastInvoiceBody||buildInvoiceBody();show('liveOut','Transmitindo uma única operação...');const result=await request('/v1/invoices',{method:'POST',body,idempotencyKey:idem});show('liveOut',result);
    }catch(e){show('liveOut','ERRO: '+e.message);}
  };
  syncStatus();
})();
</script>
</body></html>`;
}
