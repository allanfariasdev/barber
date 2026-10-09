'use strict';
const $ = id => document.getElementById(id);
const money = v => Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const timeLabel = v => new Date(v).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'});
const dateLabel = v => new Date(`${v}T12:00:00-03:00`).toLocaleDateString('pt-BR',{day:'2-digit',month:'long'});
const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const state = {services:[],barbers:[],service:null,barber:null,time:null,request:0,saving:false,screen:1};
const screens = ['step-service','step-barber','step-time','step-customer'];
let banco;
function message(text,error=false){$('booking-message').textContent=text;$('booking-message').className=`message ${error?'error':'ok'}`;}
function step(id,show){$(id).hidden=!show;$(id).querySelectorAll('input,select,button').forEach(el=>el.disabled=!show);}
function progress(n){$('progress-label').textContent=`ETAPA ${n} DE 4`;$('progress-fill').style.width=`${n*25}%`;}
function showScreen(n,focus=true){
 state.screen=n;screens.forEach((id,index)=>step(id,index===n-1));progress(n);
 $('wizard-navigation').hidden=false;$('wizard-back').hidden=n===1;$('wizard-back').disabled=state.saving;
 $('wizard-context').textContent=[n>1?state.service?.nome:null,n>2?state.barber?.nome:null].filter(Boolean).join(' · ');
 if(focus){const title=$(screens[n-1]).querySelector('legend');title.tabIndex=-1;title.focus({preventScroll:true});$('progress-label').closest('.booking-card').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}
}
function clearAfterService(){state.barber=null;state.time=null;state.request++;$('booking-date').value='';$('time-slots').replaceChildren();}
$('wizard-back').addEventListener('click',()=>{if(state.saving)return;message('');if(state.screen>1)showScreen(state.screen-1);});
function makeChoice(item,kind){
 const b=document.createElement('button');b.type='button';b.className='choice';b.dataset.id=item.id;b.setAttribute('aria-pressed','false');
 if(kind==='barber'){
  b.classList.add('barber-choice');const photo=document.createElement('img');photo.className='barber-photo';photo.alt=`Foto de ${item.nome}`;
  const fallback=item.id==='rafael'?'fotos/barba.webp':'fotos/corte.webp';
  photo.src=item.foto_path?banco.storage.from('barbeiros').getPublicUrl(item.foto_path).data.publicUrl:fallback;
  photo.addEventListener('error',()=>{if(photo.getAttribute('src')!==fallback)photo.src=fallback;else photo.hidden=true;});b.append(photo);
 }
 const title=document.createElement('strong');title.textContent=item.nome;b.append(title);
 const detail=document.createElement('small');detail.textContent=kind==='service'?`${item.duracao_minutos} minutos`:item.foto_path?'Selecione seu profissional':'Foto ilustrativa · toque para escolher';
 if(kind==='service'){const price=document.createElement('span');price.className='price';price.textContent=money(item.preco);b.append(price);}b.append(detail);
 b.addEventListener('click',()=>{
  message('');
  const container=$(kind==='service'?'service-cards':'barber-cards');
  container.querySelectorAll('button').forEach(el=>{el.classList.toggle('selected',el===b);el.setAttribute('aria-pressed',String(el===b));});
  if(kind==='service'){
   state.service=item;clearAfterService();
   $('barber-cards').querySelectorAll('button').forEach(el=>{el.classList.remove('selected');el.setAttribute('aria-pressed','false');});showScreen(2);
  }else{state.barber=item;state.time=null;state.request++;$('booking-date').value='';$('time-slots').replaceChildren();showScreen(3);}
 });return b;
}
async function loadSlots(){
 state.time=null;showScreen(3,false);
 const request=++state.request, day=$('booking-date').value;
 $('time-slots').replaceChildren();if(!day||!state.service||!state.barber)return;
 const note=document.createElement('p');note.className='muted';note.textContent='Buscando horários disponíveis…';$('time-slots').append(note);
 try{
  const {data,error}=await banco.rpc('horarios_disponiveis',{p_servico:state.service.id,p_profissional:state.barber.id,p_data:day});if(error)throw error;
  if(request!==state.request)return;
  $('time-slots').replaceChildren();
  if(!data.length){note.textContent='Nenhum horário disponível neste dia. Escolha outra data.';$('time-slots').append(note);return;}
  data.forEach(item=>{const b=document.createElement('button');b.className='slot';b.type='button';b.textContent=timeLabel(item.inicio);b.setAttribute('aria-pressed','false');b.addEventListener('click',()=>{
   state.time=item.inicio;message('');$('time-slots').querySelectorAll('button').forEach(el=>{el.classList.toggle('selected',el===b);el.setAttribute('aria-pressed',String(el===b));});
   $('booking-summary').replaceChildren();const title=document.createElement('strong');title.textContent=`${state.service.nome} · ${money(state.service.preco)}`;const text=document.createElement('span');text.textContent=`${state.barber.nome} · ${dateLabel(day)} às ${timeLabel(state.time)}`;$('booking-summary').append(title,text);showScreen(4);
  });$('time-slots').append(b);});
 }catch(e){if(request!==state.request)return;$('time-slots').replaceChildren();message(`Não foi possível buscar horários: ${e.message}`,true);}
}
$('booking-date').addEventListener('change',loadSlots);
$('booking-form').addEventListener('submit',async event=>{
 event.preventDefault();if(state.saving||!state.time)return;
 const phone=$('customer-phone').value.replace(/\D/g,'');
 if(![10,11].includes(phone.length)){message('Informe um telefone com DDD: 10 ou 11 números.',true);$('customer-phone').focus();return;}
 state.saving=true;const button=$('confirm-booking');button.disabled=true;button.textContent='Reservando…';message('');
 const reservationTime=state.time, service=state.service, barber=state.barber, day=$('booking-date').value;
 $('booking-form').querySelectorAll('button,input').forEach(el=>el.disabled=true);$('wizard-back').disabled=true;
 try{
  const {data,error}=await banco.rpc('reservar_horario',{p_servico:service.id,p_profissional:barber.id,p_inicio:reservationTime,p_nome:$('customer-name').value.trim(),p_telefone:phone});if(error)throw error;
  $('booking-form').hidden=true;$('wizard-navigation').hidden=true;$('progress-label').textContent='RESERVA CONFIRMADA';$('booking-success').hidden=false;$('success-details').textContent=`${service.nome} com ${barber.nome} · ${dateLabel(day)} às ${timeLabel(reservationTime)}`;$('reservation-code').textContent=`Código da reserva: ${data}`;$('booking-success').scrollIntoView({behavior:'smooth',block:'center'});
 }catch(e){await loadSlots();message(e.message||'Não foi possível confirmar a reserva.',true);}
 finally{state.saving=false;if(!$('booking-form').hidden)showScreen(state.screen,false);button.textContent='Confirmar agendamento';button.disabled=!state.time;}
});
$('book-again').addEventListener('click',()=>{state.service=null;clearAfterService();$('booking-form').reset();$('booking-form').hidden=false;$('booking-success').hidden=true;$('service-cards').querySelectorAll('button').forEach(el=>{el.classList.remove('selected');el.setAttribute('aria-pressed','false');});showScreen(1);message('');});
async function init(){
 try{
  if(!window.supabase)throw new Error('A biblioteca não carregou. Confira sua conexão com a internet.');
  banco=window.supabase.createClient(window.BARBEARIA_CONFIG.url,window.BARBEARIA_CONFIG.key);
  const results=await Promise.all([banco.from('servicos').select('id,nome,preco,duracao_minutos').eq('ativo',true).order('preco'),banco.from('profissionais').select('*').eq('ativo',true).order('nome')]);
  results.forEach(r=>{if(r.error)throw r.error;});state.services=results[0].data;state.barbers=results[1].data;
  $('service-cards').replaceChildren(...state.services.map(s=>makeChoice(s,'service')));$('barber-cards').replaceChildren(...state.barbers.map(p=>makeChoice(p,'barber')));
  if(!state.services.length||!state.barbers.length)message('Não há serviços ou profissionais disponíveis. Entre em contato com a barbearia.',true);
  const min=today();$('booking-date').min=min;const max=new Date(`${min}T12:00:00Z`);max.setUTCDate(max.getUTCDate()+90);$('booking-date').max=max.toISOString().slice(0,10);
 }catch(e){$('service-cards').textContent='Não foi possível carregar o catálogo.';message(e.message,true);}
}
showScreen(1,false);
init();
