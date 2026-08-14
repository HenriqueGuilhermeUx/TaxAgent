export function companyCorrectionHtml(): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="robots" content="noindex,nofollow,noarchive" />
  <title>TaxAgent · Corrigir Company</title>
  <style>
    :root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#151515;background:#f5f5f2}*{box-sizing:border-box}body{margin:0}.wrap{max-width:760px;margin:0 auto;padding:36px 18px 70px}.card{background:#fff;border:1px solid #deded8;border-radius:16px;padding:22px;box-shadow:0 1px 2px rgba(0,0,0,.03)}h1{margin:0 0 8px;font-size:28px}.muted{color:#666}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px}.full{grid-column:1/-1}label{display:block;font-size:12px;font-weight:700;color:#444;margin-bottom:5px}input,button{font:inherit}input{width:100%;border:1px solid #cfcfc8;border-radius:9px;padding:10px 11px;background:#fff}button{border:0;border-radius:9px;padding:10px 14px;background:#111;color:#fff;font-weight:700;cursor:pointer}.secondary{background:#ecece7;color:#111}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.out{white-space:pre-wrap;word-break:break-word;background:#111;color:#d7f9d7;border-radius:10px;padding:12px;min-height:64px;max-height:360px;overflow:auto;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;margin-top:16px}.warning{background:#fff7e6;border:1px solid #ead7a7;padding:10px 12px;border-radius:10px;margin-top:14px;font-size:13px}.small{font-size:12px}a{color:#111}@media(max-width:640px){.grid{grid-template-columns:1fr}.full{grid-column:auto}}
  </style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <h1>Corrigir cadastro da Company</h1>
    <p class="muted">Ferramenta interna para corrigir dados cadastrais sem recriar a empresa, o CNPJ ou a API key.</p>
    <div class="warning"><b>Segurança:</b> o bootstrap token fica somente na memória desta página. Não envie o token por chat e não salve esta página com os campos preenchidos.</div>
    <div class="grid">
      <div class="full"><label>Bootstrap token</label><input id="bootstrap" type="password" autocomplete="off" placeholder="TAXAGENT_BOOTSTRAP_TOKEN" /></div>
      <div class="full"><label>Company ID</label><input id="companyId" autocomplete="off" placeholder="comp_..." /></div>
      <div><label>Novo código IBGE do município</label><input id="cityCode" maxlength="7" inputmode="numeric" placeholder="3530607" /></div>
    </div>
    <div class="actions">
      <button class="secondary" onclick="loadCompany()">Consultar Company atual</button>
      <button onclick="correctCompany()">Corrigir município</button>
    </div>
    <pre id="out" class="out">Aguardando...</pre>
    <p class="small muted"><a href="/v1/homologation">Voltar para a Console de Homologação</a></p>
  </div>
</div>
<script>
(function(){
  'use strict';
  const $=(id)=>document.getElementById(id);
  const val=(id)=>String($(id).value||'').trim();
  const show=(value)=>{$('out').textContent=typeof value==='string'?value:JSON.stringify(value,null,2)};
  async function request(method,body){
    const token=val('bootstrap');
    const companyId=val('companyId');
    if(!token)throw new Error('Informe o bootstrap token');
    if(!companyId)throw new Error('Informe o Company ID');
    const headers={accept:'application/json','x-taxagent-bootstrap-token':token};
    let payload;
    if(body!==undefined){headers['content-type']='application/json';payload=JSON.stringify(body);}
    const response=await fetch('/v1/companies/'+encodeURIComponent(companyId),{method,headers,body:payload,cache:'no-store',credentials:'same-origin'});
    const raw=await response.text();let parsed=raw;try{parsed=raw?JSON.parse(raw):{};}catch(e){}
    if(!response.ok)throw new Error('HTTP '+response.status+' · '+(typeof parsed==='string'?parsed.slice(0,1200):JSON.stringify(parsed)));
    return parsed;
  }
  window.loadCompany=async function(){try{show('Consultando...');show(await request('GET'));}catch(e){show('ERRO: '+e.message);}};
  window.correctCompany=async function(){try{
    const city=val('cityCode');
    if(!/^\\d{7}$/.test(city))throw new Error('Código IBGE deve ter exatamente 7 dígitos');
    show('Corrigindo...');
    const result=await request('PATCH',{city_code:city});
    show({status:'corrigido',company:result,note:'CNPJ, Organization e API keys foram preservados.'});
  }catch(e){show('ERRO: '+e.message);}};
})();
</script>
</body>
</html>`;
}
