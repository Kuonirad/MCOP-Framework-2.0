'use strict';
const $ = id => document.getElementById(id);
let current, report, catalog, polling;
function saveFile(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type:'application/json'}));
  const a = document.createElement('a'); a.href=url; a.download=name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function api(url, options={}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Check the JSON schema and field limits.');
  return data;
}
function auth() { return {Authorization:`Bearer ${current.token}`}; }
function remember(order) {
  localStorage.setItem(`mcop-order-${order.id}`, JSON.stringify(order));
  current=order;
  location.hash=`order=${order.id}`;
  $('recovery').textContent='Keep the recovery JSON private. Import it here to reopen your order in another browser.';
}
async function refresh() {
  if (!current) return;
  const result = await api(`/api/orders/${current.id}`, {headers:auth()});
  $('status').textContent=`Order ${result.id}: ${result.status}${result.mode !== 'live' ? ' · '+result.mode+' (no real revenue)' : ''}`;
  $('retry').hidden=result.status !== 'pending';
  if (result.report) {
    clearInterval(polling); report=result.report; $('results').hidden=false; $('download').hidden=false;
    $('summary').textContent=JSON.stringify(report.summary, null, 2);
    $('findings').replaceChildren(...report.findings.map(f => {const li=document.createElement('li');li.textContent=`${f.code} (${f.count}): ${f.action}`;return li;}));
    $('root').textContent=`MCOP report root: ${report.provenance.root}`;
  }
}
async function checkout() {
  const result=await api(`/api/orders/${current.id}/checkout`, {method:'POST',headers:auth()});
  if(result.demo) await refresh(); else location.assign(result.url);
}
$('sample').onclick=async()=>{try{$('input').value=JSON.stringify(await api('/api/sample'),null,2);}catch(e){$('status').textContent=e.message;}};
$('upload').onchange=async e=>{try{
  const file=e.target.files[0]; if(!file)return; if(file.size>750000)throw Error('File too large.');
  const data=JSON.parse(await file.text());
  if(data.id && data.token) {
    if(!/^[a-f0-9]{32}$/.test(data.id)||!/^[A-Za-z0-9_-]{40,60}$/.test(data.token))throw Error('Invalid recovery file.');
    remember(data); await refresh();
  }else $('input').value=JSON.stringify(data,null,2);
}catch(e){$('status').textContent=e.message;}};
$('buy').onclick=async()=>{try{
  if(!$('consent').checked)throw Error('Please read and accept the service terms.');
  const payload=JSON.parse($('input').value); $('buy').disabled=true;
  // Verify storage before creating an order, so payment cannot strand access.
  localStorage.setItem('mcop-storage-check','ok');localStorage.removeItem('mcop-storage-check');
  const order=await api('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  remember(order); saveFile(`mcop-recovery-${order.id}.json`,order);
  $('status').textContent='Recovery file downloaded. Opening checkout…';await checkout();
}catch(e){$('status').textContent=e.message;}finally{$('buy').disabled=false;}};
$('retry').onclick=()=>checkout().catch(e=>$('status').textContent=e.message);
$('download').onclick=()=>saveFile(`mcop-report-${current.id}.json`,report);
(async()=>{try{
  catalog=await api('/api/catalog');
  $('price').textContent=`${new Intl.NumberFormat('en-CA',{style:'currency',currency:catalog.currency}).format(catalog.amount/100)} CAD / report · ${catalog.mode.toUpperCase()}${catalog.mode==='demo'?' — free demonstration':''}`;
  $('buy').textContent=catalog.mode==='demo'?'Generate free demo report':'Continue to secure checkout'; $('buy').disabled=false;
  if(catalog.support)$('support').textContent=catalog.support;
  const id=new URLSearchParams(location.hash.slice(1)).get('order');
  if(id&&/^[a-f0-9]{32}$/.test(id)) {
    const saved=localStorage.getItem(`mcop-order-${id}`);
    if(!saved)throw Error('Import your private recovery JSON to access this order.');
    current=JSON.parse(saved);await refresh();
    if(!report) {let attempts=0;polling=setInterval(()=>{if(++attempts>60){clearInterval(polling);$('status').textContent+=' · Refresh later to check payment.';return;}refresh().catch(e=>{clearInterval(polling);$('status').textContent=e.message;});},3000);}
  }
}catch(e){$('status').textContent=e.message;}})();
