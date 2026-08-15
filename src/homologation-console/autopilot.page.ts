export function fiscalAutopilotHtml(): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex,nofollow,noarchive" />
<title>TaxAgent · Autopilot</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#161616;background:#f4f4f0}*{box-sizing:border-box}body{margin:0}.wrap{max-width:820px;margin:0 auto;padding:32px 18px 72px}h1{font-size:34px;margin:4px 0 8px}h2{font-size:19px;margin:0 0 14px}.eyebrow{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#707068}.lead{font-size:17px;line-height:1.5;color:#555;margin:0 0 24px}.card{background:#fff;border:1px solid #deded8;border-radius:18px;padding:20px;margin:14px 0;box-shadow:0 1px 2px rgba(0,0,0,.03)}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.full{grid-column:1/-1}label{display:block;font-size:12px;font-weight:750;color:#444;margin:0 0 5px}input,select,textarea,button{font:inherit}input,select,textarea{width:100%;padding:11px;border:1px solid #cccac3;border-radius:10px;background:#fff}textarea{min-height:92px;resize:vertical}button{border:0;border-radius:10px;background:#111;color:#fff;font-weight:750;padding:11px 15px;cursor:pointer}button.secondary{background:#ecece7;color:#111}button.choice{background:#f1f1ec;color:#111;border:1px solid #d8d8d0}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.muted{color:#696963;font-size:13px;line-height:1.45}.status{border-radius:12px;padding:12px 14px;background:#f6f6f2;margin:12px 0}.status strong{display:block;margin-bottom:3px}.question{border:1px solid #e2cf91;background:#fff9e8;border-radius:12px;padding:14px;margin-top:12px}.out{white-space:pre-wrap;word-break:break-word;background:#151515;color:#dff8df;border-radius:12px;padding:14px;max-height:320px;overflow:auto;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}.secret{font-size:12px;color:#705c28;background:#fff8e7;border-radius:10px;padding:10px 12px}.toplinks{display:flex;gap:12px;margin-top:10px;font-size:13px}.toplinks a{color:#333}@media(max-width:700px){.grid{grid-template-columns:1fr}.full{grid-column:auto}}
</style>
</head>
<body><div class="wrap">
<div class="eyebrow">TaxAgent · modo simples</div>
<h1>Autopilot fiscal</h1>
<p class="lead">Informe cliente, serviço e valor. O TaxAgent resolve a tributação, prepara a DPS e avança sozinho até o máximo seguro. Só pergunta quando existe uma decisão humana real.</p>
<div class="toplinks"><a href="/v1/homologation">Console expert</a><a href="/docs">Swagger</a></div>

<div class="card"><h2>1 · Acesso desta aba</h2>
<p class="muted">Durante a homologação ainda usamos Company ID e API key. Nada é salvo no navegador.</p>
<div class="grid"><div><label>Company ID</label><input id="companyId" placeholder="comp_..." /></div><div><label>API key TEST</label><input id="apiKey" type="password" autocomplete="off" placeholder="ta_test_..." /></div></div>
<div class="secret">A API key fica somente na memória desta página. Não envie a chave por chat.</div>
</div>

<div class="card"><h2>2 · A operação</h2>
<div class="grid">
<div><label>CNPJ/CPF do cliente</label><input id="customerTaxId" /></div>
<div><label>Nome / razão social</label><input id="customerName" /></div>
<div><label>Município do cliente (IBGE)</label><input id="customerCity" maxlength="7" placeholder="3550308" /></div>
<div><label>Valor</label><input id="amount" type="number" min="0.01" step="0.01" value="100.00" /></div>
<div class="full"><label>O que você vendeu?</label><textarea id="description" placeholder="Ex.: Serviços de consultoria empresarial">Serviços de consultoria empresarial</textarea></div>
<div><label>Competência</label><input id="competence" type="date" /></div>
<div><label>O cliente vai reter ISS?</label><select id="issWithholding"><option value="">Não sei / perguntar se necessário</option><option value="not_withheld">Não</option><option value="customer">Sim · pelo tomador</option><option value="intermediary">Sim · pelo intermediário</option></select></div>
</div>
<div class="actions"><button onclick="startAutopilot()">Resolver e preparar automaticamente</button></div>
</div>

<div class="card"><h2>3 · Seu Fiscal Intent</h2>
<div class="grid"><div class="full"><label>Fiscal Intent ID</label><input id="intentId" placeholder="fint_..." /></div></div>
<div class="actions"><button class="secondary" onclick="loadIntent()">Retomar / consultar</button><button class="secondary" onclick="continueIntent()">Continuar automaticamente</button></div>
<div id="status" class="status"><strong>Nenhuma operação ativa.</strong><span class="muted">Crie uma acima ou informe um Fiscal Intent existente.</span></div>
<div id="question"></div>
<pre id="out" class="out">Aguardando...</pre>
</div>

<div class="card"><h2>4 · Certificado A1 · uma vez só</h2>
<p class="muted">Quando seu A1 chegar, envie aqui. Depois clique em “Continuar automaticamente” no mesmo Fiscal Intent. O TaxAgent assina o Prepared DPS congelado e faz o preflight sem você refazer a nota.</p>
<div class="grid"><div><label>Arquivo .pfx/.p12</label><input id="a1File" type="file" accept=".pfx,.p12,application/x-pkcs12" /></div><div><label>Senha do A1</label><input id="a1Password" type="password" autocomplete="new-password" /></div></div>
<div class="actions"><button class="secondary" onclick="uploadA1()">Cadastrar A1</button></div>
<pre id="a1Out" class="out">Aguardando certificado...</pre>
</div>
</div>
<script>
(function(){
'use strict';
const $=(id)=>document.getElementById(id);let currentIntent='';let currentKey='auto-'+crypto.randomUUID();
const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));$('competence').value=map.year+'-'+map.month+'-'+map.day;
function auth(){const key=String($('apiKey').value||'').trim();if(!key)throw new Error('Informe a API key TEST');return key;}
function company(){const id=String($('companyId').value||'').trim();if(!id)throw new Error('Informe o Company ID');return id;}
async function request(path,options){const opts=options||{};const headers={accept:'application/json',authorization:'Bearer '+auth()};if(opts.body!==undefined){headers['content-type']='application/json';}if(opts.idempotencyKey)headers['idempotency-key']=opts.idempotencyKey;const r=await fetch(path,{method:opts.method||'GET',headers,body:opts.body===undefined?undefined:JSON.stringify(opts.body),cache:'no-store',credentials:'same-origin'});const raw=await r.text();let parsed=raw;try{parsed=raw?JSON.parse(raw):{};}catch(e){}if(!r.ok)throw new Error('HTTP '+r.status+' · '+(typeof parsed==='string'?parsed.slice(0,1200):JSON.stringify(parsed)));return parsed;}
function render(result){currentIntent=result.id||currentIntent;if(currentIntent)$('intentId').value=currentIntent;$('out').textContent=JSON.stringify(result,null,2);const stage=result.stage||result.status||'desconhecido';const next=result.next_action&&result.next_action.message?result.next_action.message:'Nenhuma ação necessária agora.';$('status').innerHTML='<strong>'+escapeHtml(stage)+'</strong><span class="muted">'+escapeHtml(next)+'</span>';renderQuestion(result.question);}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function renderQuestion(q){const box=$('question');box.innerHTML='';if(!q)return;const wrap=document.createElement('div');wrap.className='question';const p=document.createElement('div');p.textContent=q.prompt;wrap.appendChild(p);const actions=document.createElement('div');actions.className='actions';for(const option of q.options||[]){const b=document.createElement('button');b.className='choice';b.textContent=option.label;b.onclick=()=>answerQuestion(q.id,option.value);actions.appendChild(b);}wrap.appendChild(actions);box.appendChild(wrap);}
window.startAutopilot=async function(){try{company();const body={company_id:company(),environment:'test',competence:$('competence').value,customer:{tax_id:$('customerTaxId').value.trim(),name:$('customerName').value.trim(),city_code:$('customerCity').value.trim()},service:{description:$('description').value.trim(),amount:Number($('amount').value)}};const retention=$('issWithholding').value;if(retention)body.iss_withholding=retention;$('out').textContent='Autopilot trabalhando...';const result=await request('/v1/fiscal/autopilot',{method:'POST',body,idempotencyKey:currentKey});render(result);}catch(e){$('out').textContent='ERRO: '+e.message;}};
window.answerQuestion=async function(id,value){try{const intent=$('intentId').value.trim()||currentIntent;if(!intent)throw new Error('Nenhum Fiscal Intent ativo');const body={};body[id]=value;const result=await request('/v1/fiscal/autopilot/'+encodeURIComponent(intent)+'/answer',{method:'POST',body});render(result);}catch(e){$('out').textContent='ERRO: '+e.message;}};
window.loadIntent=async function(){try{const intent=$('intentId').value.trim();if(!intent)throw new Error('Informe o Fiscal Intent ID');const result=await request('/v1/fiscal/autopilot/'+encodeURIComponent(intent));render(result);}catch(e){$('out').textContent='ERRO: '+e.message;}};
window.continueIntent=async function(){try{const intent=$('intentId').value.trim()||currentIntent;if(!intent)throw new Error('Informe o Fiscal Intent ID');const result=await request('/v1/fiscal/autopilot/'+encodeURIComponent(intent)+'/continue',{method:'POST'});render(result);}catch(e){$('out').textContent='ERRO: '+e.message;}};
window.uploadA1=async function(){try{const file=$('a1File').files[0],password=$('a1Password').value;if(!file)throw new Error('Selecione o A1');if(!password)throw new Error('Informe a senha');const form=new FormData();form.append('file',file);form.append('password',password);const headers={accept:'application/json',authorization:'Bearer '+auth()};$('a1Out').textContent='Validando e cifrando...';const r=await fetch('/v1/companies/'+encodeURIComponent(company())+'/certificates/upload',{method:'POST',headers,body:form,cache:'no-store',credentials:'same-origin'});const raw=await r.text();let parsed=raw;try{parsed=raw?JSON.parse(raw):{};}catch(e){}if(!r.ok)throw new Error('HTTP '+r.status+' · '+JSON.stringify(parsed));$('a1Password').value='';$('a1File').value='';$('a1Out').textContent=JSON.stringify(parsed,null,2);}catch(e){$('a1Out').textContent='ERRO: '+e.message;}};
})();
</script>
</body></html>`;
}
