'use strict';
const $=id=>document.getElementById(id);
const money=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const clock=v=>new Date(v).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'});
const dateText=v=>new Date(v).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'});
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let banco,services=[],barbers=[],history=[],agenda=[],agendaRequest=0,historyRequest=0,freeRequest=0;
function notify(text,error=false){$('admin-message').textContent=text;$('admin-message').className=`message ${error?'error':'ok'}`;}
function textNode(tag,text,className=''){const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;}
function empty(parent,text){parent.replaceChildren(textNode('p',text,'empty'));}
function button(text,fn,danger=false){const b=textNode('button',text,`button small ${danger?'danger':'secondary'}`);b.type='button';b.addEventListener('click',()=>action(b,fn));return b;}
async function action(el,fn){el.disabled=true;try{await fn();}catch(e){notify(e.message,true);}finally{el.disabled=false;}}
async function checked(query){const r=await query;if(r.error)throw r.error;return r.data;}
async function allRows(makeQuery){let rows=[],page=0;while(true){const batch=await checked(makeQuery().range(page*500,page*500+499));rows.push(...batch);if(batch.length<500)return rows;page++;}}
function bounds(day){const start=new Date(`${day}T00:00:00-03:00`),end=new Date(start);end.setUTCDate(end.getUTCDate()+1);return [start.toISOString(),end.toISOString()];}
function stats(id,entries){$(id).replaceChildren(...entries.map(([label,value])=>{const box=textNode('article','','stat');box.append(textNode('span',label),textNode('strong',value));return box;}));}
function fill(select,list,all=false){const previous=select.value;select.replaceChildren();if(all)select.add(new Option('Todos os barbeiros',''));list.forEach(item=>select.add(new Option(item.nome,item.id)));if([...select.options].some(o=>o.value===previous))select.value=previous;}
function appointment(a,editable=false,monthly=false){
 const row=textNode('article','','appointment');row.append(textNode('div',monthly?dateText(a.inicio):clock(a.inicio),'appointment-time'));
 const info=textNode('div','','appointment-info');info.append(textNode('h3',a.cliente_nome),textNode('p',`${monthly?clock(a.inicio)+' · ':''}${a.servico_nome||services.find(s=>s.id===a.servico_id)?.nome||'Serviço'} · ${a.profissional_nome||barbers.find(p=>p.id===a.profissional_id)?.nome||'Barbeiro'} · ${money(a.valor)}`),textNode('p',`Telefone: ${a.cliente_telefone}`),textNode('span',a.status,`badge ${a.status}`));row.append(info);
 if(editable&&a.status==='confirmado'){
  const actions=textNode('div','','appointment-actions');
  actions.append(button('Concluir',async()=>{if(new Date(a.fim)>new Date())throw new Error('Aguarde o término do horário para concluir.');await checked(banco.from('agendamentos').update({status:'concluido'}).eq('id',a.id));notify('Atendimento concluído.');await loadAgenda();}),button('Cancelar',async()=>{if(!window.confirm(`Cancelar a reserva de ${a.cliente_nome}? O horário será liberado e o registro ficará no histórico.`))return;await checked(banco.from('agendamentos').update({status:'cancelado'}).eq('id',a.id));notify('Reserva cancelada. Horário liberado.');await loadAgenda();},true));row.append(actions);
 }return row;
}
async function loadAgenda(){
 const request=++agendaRequest,day=$('agenda-date').value;if(!day)return;
 const [start,end]=bounds(day);const rows=await allRows(()=>banco.from('agendamentos').select('*').gte('inicio',start).lt('inicio',end).order('inicio').order('id'));if(request!==agendaRequest)return;agenda=rows;
 stats('agenda-stats',[['Confirmados',rows.filter(a=>a.status==='confirmado').length],['Concluídos',rows.filter(a=>a.status==='concluido').length],['Faturamento concluído',money(rows.filter(a=>a.status==='concluido').reduce((sum,a)=>sum+Number(a.valor),0))]]);
 if(rows.length)$('appointments').replaceChildren(...rows.map(a=>appointment(a,true)));else empty($('appointments'),'Nenhum agendamento neste dia.');await loadFree();
}
async function loadFree(){
 const request=++freeRequest;empty($('free-slots'),'Carregando disponibilidade…');
 if(!$('free-service').value||!$('free-barber').value){empty($('free-slots'),'Cadastre um serviço e um barbeiro ativos.');return;}
 const rows=await checked(banco.rpc('horarios_disponiveis',{p_servico:$('free-service').value,p_profissional:$('free-barber').value,p_data:$('agenda-date').value}));if(request!==freeRequest)return;
 if(rows.length)$('free-slots').replaceChildren(...rows.map(r=>textNode('span',clock(r.inicio),'slot')));else empty($('free-slots'),'Nenhum horário livre para esta combinação.');
}
function input(label,value,type='text',attrs={}){const l=textNode('label',label);const i=document.createElement('input');i.type=type;i.value=value;Object.assign(i,attrs);l.append(i);return [l,i];}
function checkbox(value){const l=textNode('label','','check-label'),i=document.createElement('input');i.type='checkbox';i.checked=value;l.append(i,document.createTextNode('Ativo'));return[l,i];}
function serviceEditor(s){
 const row=textNode('article','','editor-row'),form=document.createElement('form');const[n,nv]=input('Nome',s.nome,'text',{required:true,maxLength:80}),[p,pv]=input('Preço (R$)',s.preco,'number',{required:true,min:'0',max:'9999',step:'.01'}),[d,dv]=input('Minutos',s.duracao_minutos,'number',{required:true,min:'15',max:'480',step:'15'}),[a,av]=checkbox(s.ativo),save=textNode('button','Salvar','button small');form.append(n,p,d,a,save);form.addEventListener('submit',event=>{event.preventDefault();action(save,async()=>{await checked(banco.from('servicos').update({nome:nv.value.trim(),preco:Number(pv.value),duracao_minutos:Number(dv.value),ativo:av.checked}).eq('id',s.id));notify('Serviço atualizado. Reservas anteriores mantêm seus valores.');await loadCatalog();});});row.append(form);return row;
}
function barberEditor(p){
 const row=textNode('article','','editor-row barber-editor'),form=document.createElement('form');form.className='barber-form';const[n,nv]=input('Nome',p.nome,'text',{required:true,maxLength:80}),[a,av]=checkbox(p.ativo),save=textNode('button','Salvar','button small');form.append(n,a,save);form.addEventListener('submit',e=>{e.preventDefault();action(save,async()=>{await checked(banco.from('profissionais').update({nome:nv.value.trim(),ativo:av.checked}).eq('id',p.id));notify('Profissional atualizado.');await loadCatalog();});});
 const photos=textNode('div','','barber-photo-editor');photos.dataset.barberId=p.id;
 const preview=document.createElement('img'),fallback=p.id==='rafael'?'fotos/barba.webp':'fotos/corte.webp';preview.className='admin-barber-photo';preview.alt=`Foto de ${p.nome}`;preview.src=p.foto_path?banco.storage.from('barbeiros').getPublicUrl(p.foto_path).data.publicUrl:fallback;preview.addEventListener('error',()=>{if(preview.getAttribute('src')!==fallback)preview.src=fallback;else preview.hidden=true;});
 const controls=textNode('div','','photo-controls'),label=textNode('label','Escolher foto'),file=document.createElement('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';label.append(file);
 const hint=textNode('p','JPG, PNG ou WEBP · até 5 MB. Escolha a foto e clique em Enviar.','muted');
 let objectURL=null;file.addEventListener('change',()=>{if(objectURL)URL.revokeObjectURL(objectURL);objectURL=null;if(file.files[0]){objectURL=URL.createObjectURL(file.files[0]);preview.src=objectURL;}else preview.src=p.foto_path?banco.storage.from('barbeiros').getPublicUrl(p.foto_path).data.publicUrl:fallback;});
 const send=button('Enviar foto',async()=>{
  const selected=file.files[0];if(!selected)throw new Error('Escolha uma foto primeiro.');
  const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};if(!types[selected.type])throw new Error('Use uma imagem JPG, PNG ou WEBP.');if(selected.size>5*1024*1024)throw new Error('A foto deve ter no máximo 5 MB.');
  const storage=banco.storage.from('barbeiros'),path=`${encodeURIComponent(p.id)}/${crypto.randomUUID()}.${types[selected.type]}`,previousPath=p.foto_path;file.disabled=true;remove.disabled=true;
  let uploaded=false,saved=false;
  try{
   const result=await storage.upload(path,selected,{upsert:false,cacheControl:'3600',contentType:selected.type});if(result.error)throw result.error;uploaded=true;
   await checked(banco.from('profissionais').update({foto_path:path}).eq('id',p.id));saved=true;
   if(previousPath)await storage.remove([previousPath]);if(objectURL)URL.revokeObjectURL(objectURL);
   await loadCatalog();notify('Foto salva! Atualize o site para ver a imagem no agendamento.');
  }catch(e){if(uploaded&&!saved)await storage.remove([path]);throw new Error(saved?`Foto salva, mas não foi possível atualizar o painel: ${e.message}. Atualize a página.`:`${e.message} Confira se executou fotos-barbeiros.sql e criou o bucket público barbeiros.`);}
  finally{file.disabled=false;remove.disabled=false;}
 });send.classList.add('send-photo');
 const remove=button('Usar foto fictícia',async()=>{
  file.disabled=true;send.disabled=true;
  try{const previousPath=p.foto_path;await checked(banco.from('profissionais').update({foto_path:null}).eq('id',p.id));if(previousPath)await banco.storage.from('barbeiros').remove([previousPath]);if(objectURL)URL.revokeObjectURL(objectURL);await loadCatalog();notify('Foto fictícia restaurada.');}finally{file.disabled=false;send.disabled=false;}
 });remove.classList.add('reset-photo');remove.disabled=!p.foto_path;
 controls.append(label,hint,send,remove);photos.append(preview,controls);row.append(form,photos);return row;
}
async function loadCatalog(){
 [services,barbers]=await Promise.all([checked(banco.from('servicos').select('*').order('nome')),checked(banco.from('profissionais').select('*').order('nome'))]);
 $('services-admin').replaceChildren(...services.map(serviceEditor));$('barbers-admin').replaceChildren(...barbers.map(barberEditor));
 fill($('free-service'),services.filter(s=>s.ativo));fill($('free-barber'),barbers.filter(p=>p.ativo));fill($('block-barber'),barbers,true);
 const config=await checked(banco.from('configuracoes').select('*').eq('id',1).single());$('hours-form').elements.abertura.value=config.abertura.slice(0,5);$('hours-form').elements.fechamento.value=config.fechamento.slice(0,5);
}
async function loadBlocks(){
 const [days,times]=await Promise.all([checked(banco.from('dias_bloqueados').select('*').order('data')),checked(banco.from('horarios_bloqueados').select('*').order('inicio'))]);
 const dayRows=days.map(d=>{const row=textNode('article','','editor-row');row.append(textNode('p',`${dateText(d.data+'T12:00:00-03:00')} · ${d.motivo||'Dia fechado'}`),button('Liberar dia',async()=>{await checked(banco.from('dias_bloqueados').delete().eq('data',d.data));notify('Dia liberado.');await loadBlocks();}));return row;});
 if(dayRows.length)$('blocked-days').replaceChildren(...dayRows);else empty($('blocked-days'),'Nenhum dia bloqueado.');
 const timeRows=times.map(t=>{const row=textNode('article','','editor-row');row.append(textNode('p',`${dateText(t.inicio)} · ${clock(t.inicio)}–${clock(t.fim)} · ${t.profissional_id?barbers.find(p=>p.id===t.profissional_id)?.nome||'Barbeiro':'Todos'} · ${t.motivo||'Indisponível'}`),button('Remover bloqueio',async()=>{await checked(banco.from('horarios_bloqueados').delete().eq('id',t.id));notify('Horário liberado.');await loadBlocks();}));return row;});
 if(timeRows.length)$('blocked-times').replaceChildren(...timeRows);else empty($('blocked-times'),'Nenhum intervalo bloqueado.');
}
async function loadHistory(){
 const request=++historyRequest,month=$('history-month').value;if(!month)return;const [y,m]=month.split('-').map(Number),next=m===12?`${y+1}-01`:`${y}-${String(m+1).padStart(2,'0')}`;
 const rows=await allRows(()=>banco.from('agendamentos').select('*').gte('inicio',`${month}-01T00:00:00-03:00`).lt('inicio',`${next}-01T00:00:00-03:00`).order('inicio').order('id'));if(request!==historyRequest)return;history=rows;
 stats('history-stats',[['Reservas do mês',rows.length],['Concluídos / cancelados',`${rows.filter(a=>a.status==='concluido').length} / ${rows.filter(a=>a.status==='cancelado').length}`],['Faturamento concluído',money(rows.filter(a=>a.status==='concluido').reduce((n,a)=>n+Number(a.valor),0))]]);
 if(rows.length)$('history-list').replaceChildren(...rows.map(a=>appointment(a,false,true)));else empty($('history-list'),'Nenhum agendamento neste mês.');
}
function bindForm(id,handler){$(id).addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;action(form.querySelector('button'),()=>handler(form));});}
bindForm('add-service',async form=>{const v=Object.fromEntries(new FormData(form));if(v.nome.trim().length<2)throw new Error('Informe um nome para o serviço.');await checked(banco.from('servicos').insert({id:crypto.randomUUID(),nome:v.nome.trim(),preco:Number(v.preco),duracao_minutos:Number(v.duracao),ativo:true}));form.reset();await loadCatalog();notify('Novo serviço adicionado.');});
bindForm('add-barber',async form=>{const name=form.elements.nome.value.trim();if(name.length<2)throw new Error('Informe o nome do profissional.');await checked(banco.from('profissionais').insert({id:crypto.randomUUID(),nome:name,ativo:true}));form.reset();await loadCatalog();notify('Profissional adicionado.');});
bindForm('hours-form',async form=>{const v=Object.fromEntries(new FormData(form));if(v.fechamento<=v.abertura)throw new Error('Fechamento deve ser depois da abertura.');await checked(banco.from('configuracoes').update(v).eq('id',1));notify('Expediente atualizado.');});
bindForm('block-day',async form=>{const v=Object.fromEntries(new FormData(form));await checked(banco.from('dias_bloqueados').upsert({data:v.data,motivo:v.motivo.trim()}));await loadBlocks();notify('Dia bloqueado para novas reservas. Confira as reservas já existentes na Agenda.');});
bindForm('block-time',async form=>{const v=Object.fromEntries(new FormData(form));if(v.fim<=v.inicio)throw new Error('O fim deve ser depois do início.');await checked(banco.from('horarios_bloqueados').insert({profissional_id:v.profissional||null,inicio:`${v.data}T${v.inicio}:00-03:00`,fim:`${v.data}T${v.fim}:00-03:00`,motivo:v.motivo.trim()}));await loadBlocks();notify('Intervalo bloqueado para novas reservas.');});
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>action(b,async()=>{document.querySelectorAll('[data-tab]').forEach(t=>t.classList.toggle('active',t===b));document.querySelectorAll('.tab-panel').forEach(p=>p.hidden=p.id!==`panel-${b.dataset.tab}`);notify('');if(b.dataset.tab==='agenda')await loadAgenda();if(b.dataset.tab==='catalogo')await loadCatalog();if(b.dataset.tab==='bloqueios')await loadBlocks();if(b.dataset.tab==='historico')await loadHistory();})));
$('agenda-date').addEventListener('change',()=>action($('refresh-agenda'),loadAgenda));$('refresh-agenda').addEventListener('click',()=>action($('refresh-agenda'),loadAgenda));
['free-service','free-barber'].forEach(id=>$(id).addEventListener('change',()=>loadFree().catch(e=>notify(e.message,true))));
$('history-month').addEventListener('change',()=>loadHistory().catch(e=>notify(e.message,true)));
$('export-csv').addEventListener('click',()=>{
 const escape=v=>{const text=String(v??'');return '"'+(/^[=+@\-\t\r]/.test(text)?"'":'')+text.replaceAll('"','""')+'"';};
 const rows=[['Data','Hora','Cliente','Telefone','Serviço','Barbeiro','Valor','Status'],...history.map(a=>[dateText(a.inicio),clock(a.inicio),a.cliente_nome,a.cliente_telefone,a.servico_nome,a.profissional_nome,String(a.valor).replace('.',','),a.status])];
 const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(escape).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8;'}));const link=document.createElement('a');link.href=url;link.download=`historico-${$('history-month').value}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
async function openDashboard(session){
 if(!session){$('dashboard').hidden=true;$('logout').hidden=true;$('login-section').hidden=false;return;}
 const admin=await checked(banco.rpc('verificar_admin'));if(!admin){await banco.auth.signOut();throw new Error('Sua conta não foi liberada como administrador. Execute liberar-admin.sql com seu User UID.');}
 $('admin-email').textContent=session.user.email;$('dashboard').hidden=false;$('logout').hidden=false;$('login-section').hidden=true;
 await loadCatalog();await loadAgenda();
}
$('login-form').addEventListener('submit',async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button');btn.disabled=true;$('login-message').textContent='Entrando…';try{const {data,error}=await banco.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)throw error;await openDashboard(data.session);$('password').value='';$('login-message').textContent='';}catch(err){$('login-message').textContent=err.message;}finally{btn.disabled=false;}});
$('logout').addEventListener('click',()=>action($('logout'),async()=>{const {error}=await banco.auth.signOut();if(error)throw error;location.reload();}));
async function init(){try{if(!window.supabase)throw new Error('Biblioteca não carregou. Confira sua conexão com a internet.');banco=window.supabase.createClient(window.BARBEARIA_CONFIG.url,window.BARBEARIA_CONFIG.key);$('agenda-date').value=today();$('history-month').value=today().slice(0,7);const {data,error}=await banco.auth.getSession();if(error)throw error;await openDashboard(data.session);}catch(e){$('login-message').textContent=e.message;}}
init();
