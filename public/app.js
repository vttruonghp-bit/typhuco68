const params=new URLSearchParams(location.search);
const demo=params.get('demo');
const socket=demo?null:io();
let state=null,me='demo-1';
let selectedLimit=6,selectedSetup=0,tokenChoice={color:'#0f8b7d',icon:'🍃'},selectTarget=null;
const $=s=>document.querySelector(s);
const colors=[['#0f8b7d','Xanh'],['#7e50c9','Tím'],['#dc7a3a','Cam'],['#377fc7','Lam'],['#c95187','Hồng'],['#526177','Ghi'],['#d2a51d','Vàng'],['#cc3e48','Đỏ']];
const icons=['🍃','🌙','🚗','⛵','🚆','☁️','💨','👟','🎩','🖐️','🐰','🍎','🏠','🧑‍🎓','👩‍🎓','⭐','🚀','💎','🧭','⚡'];
const boardPos=i=>i===0?[10,10]:i<10?[10,10-i]:i===10?[10,0]:i<20?[20-i,0]:i===20?[0,0]:i<30?[0,i-20]:i===30?[0,10]:[i-30,10];
const boardNames=['Bắt Đầu','Phố Cổ','Khí Vận','Chợ Đồng Xuân','Thuế Lương Bổng','Ga Hà Nội','Bưu Điện Hà Nội','Cơ Hội','Nhà Hát Lớn','Tháp Rùa','Metro và Tù','Quảng Trường Ba Đình','Nhà Máy Điện','Hoàng Thành','Văn Miếu','Ga Vinh','Vịnh Hạ Long','Khí Vận','Sơn Đoòng','Tràng An','Bãi Đỗ Xe','Cầu Rồng Đà Nẵng','Cơ Hội','Cung Đình Huế','Hội An','Ga Đà Nẵng','Dinh Độc Lập','Nhà Thờ Đức Bà','Nhà Máy Nước','Bến Nhà Rồng','Vào Tù','Chợ Bến Thành','Landmark81','Khí Vận','Bitexco','Ga Sài Gòn','Cơ Hội','Tháp Chăm','Thuế Lợi Tức','Phú Quốc'];
const kinds=['start','land','fortune','land','tax','rail','land','chance','land','land','metro','land','utility','land','land','rail','land','fortune','land','land','parking','land','chance','land','land','rail','land','land','utility','land','jailgo','land','land','fortune','land','rail','chance','land','tax','land'];
const prices={1:60,3:60,6:100,8:100,9:120,11:140,13:140,14:160,16:180,18:180,19:200,21:220,23:220,24:240,26:260,27:260,29:280,31:300,32:300,34:320,37:350,39:400};
const rents=[2,10,30,90,160,250];
const BOARD=boardNames.map((name,i)=>({name,kind:kinds[i],price:prices[i]||(['rail'].includes(kinds[i])?200:kinds[i]==='utility'?150:0),build:i<10?50:i<20?100:i<30?150:200,rents}));
const infoText={TURN:'Lượt của bạn · chọn hành động tiếp theo.',AWAIT_BUY:'Ô này chưa có chủ. Chọn mua hoặc bỏ qua.',AWAIT_PAYMENT:'Bạn cần hoàn tất khoản thanh toán này.',AWAIT_METRO:'Metro mở giao diện chọn đủ 40 ô.',AWAIT_CARD_ACTION:'Thực hiện hiệu ứng thẻ đang mở.',AWAIT_FIRE_CONFIRM:'Máy chủ đã gieo xúc xắc cho mọi người. Kiểm tra rồi xác nhận.',AWAIT_DEBT:'Chọn tài sản để hạ cấp, cắm hoặc bán trước khi thanh toán.',AWAIT_JAIL_PAYMENT:'Trả phí hoặc dùng thẻ để ra tù.',GAME_OVER:'Ván đấu đã kết thúc.'};

initLobby();
bindStatic();
if(demo) loadDemo(demo);
else {
  socket.on('connect',()=>{me=socket.id});
  socket.on('notice',n=>notice(n.text));
  socket.on('state',s=>{const rolled=state&&s.lastRoll?.length&&JSON.stringify(state.lastRoll)!==JSON.stringify(s.lastRoll);state=s;showGame();render();if(rolled)animateDice();});
}

function bindStatic(){
  $('#create').onclick=()=>emit('create-room',{name:setupPlayers()[0]?.name||'Linh',limit:selectedLimit});
  $('#join').onclick=()=>emit('join-room',{name:setupPlayers()[0]?.name||'Người chơi',code:$('#code').value.trim().toUpperCase()});
  $('#start').onclick=()=>emit('start-game');
  $('#saveSetup').onclick=()=>emit('setup-player',{name:setupPlayers()[0]?.name||mine()?.name,color:setupPlayers()[0]?.color||mine()?.color,icon:setupPlayers()[0]?.icon||mine()?.icon});
  $('#surrender').onclick=()=>{if(confirm('Đầu hàng sẽ kết thúc ván. Bạn chắc chắn chứ?'))emit('surrender')};
  $('#openToken').onclick=()=>openToken();
  $('#confirmToken').onclick=()=>{emit('change-token',tokenChoice);closeModal('tokenModal')};
  $('#stayMetro').onclick=()=>{emit('metro',null);closeModal('selectModal')};
  $('#confirmSelect').onclick=()=>{if(selectTarget===null)return notice('Hãy chọn một ô trước.'); if(state?.phase==='AWAIT_METRO')emit('metro',selectTarget); else emit('card-action',{target:selectTarget}); closeModal('selectModal')};
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
}
function emit(event,payload){if(demo){notice('Ảnh demo: thao tác được khoá để chụp giao diện.');return}socket.emit(event,payload)}
function notice(text){const n=$('#notice');if(n)n.textContent=text;setTimeout(()=>{if(n)n.textContent=''},3500)}
function showGame(){$('#lobby').hidden=true;$('#game').hidden=false}
function current(){return state?.players[state.currentIndex]}
function mine(){return state?.players.find(p=>p.id===me)}
function isOwnTurn(active=current()){return !!active&&active.id===me&&state?.phase!=='LOBBY'&&state?.phase!=='GAME_OVER'}
function closeModal(id){const el=document.getElementById(id);if(el)el.hidden=true}
function animateDice(){const d=$('#dice');d.classList.remove('rolling');void d.offsetWidth;d.classList.add('rolling');setTimeout(()=>d.classList.remove('rolling'),1400)}

function initLobby(){
  const pills=$('#limitPills');
  pills.innerHTML=[2,3,4,5,6].map(n=>`<button class="limit-pill ${n===selectedLimit?'active':''}" data-limit="${n}">${n}</button>`).join('');
  pills.querySelectorAll('button').forEach(b=>b.onclick=()=>{selectedLimit=Number(b.dataset.limit);$('#limit').value=selectedLimit;$('#create').textContent=`Bắt đầu ván ${selectedLimit} người`;initLobby()});
  const defaults=['Linh','Minh','An','Vy','Huy','Nam'];
  $('#playerCountLabel').textContent=`${selectedLimit} NGƯỜI CHƠI`;
  $('#setupCards').innerHTML=Array.from({length:selectedLimit},(_,i)=>setupCard(i,defaults[i]||`Người chơi ${i+1}`)).join('');
  document.querySelectorAll('[data-setup-color]').forEach(b=>b.onclick=()=>{const card=b.closest('.setup-card');card.style.setProperty('--c',b.dataset.setupColor);card.dataset.color=b.dataset.setupColor;card.querySelectorAll('.mini-color').forEach(x=>x.classList.toggle('active',x===b))});
  document.querySelectorAll('[data-change-token]').forEach(b=>b.onclick=()=>{selectedSetup=Number(b.dataset.changeToken);tokenChoice={color:colors[selectedSetup%colors.length][0],icon:icons[selectedSetup]};$('#oldIcon').textContent=icons[selectedSetup];drawTokenModal();$('#tokenModal').hidden=false});
}
function setupCard(i,name){
 const [c]=colors[i%colors.length],icon=icons[i%icons.length];
 return `<article class="setup-card" data-color="${c}" style="--c:${c}"><label>NGƯỜI CHƠI ${i+1}</label><input value="${name}" maxlength="18"><span class="setup-token">${icon}</span><div class="mini-colors">${colors.map(([hex])=>`<button class="mini-color ${hex===c?'active':''}" data-setup-color="${hex}" style="background:${hex}"></button>`).join('')}</div><footer><span>KÍ HIỆU ${icon}</span><button data-change-token="${i}">Đổi</button></footer></article>`;
}
function setupPlayers(){return [...document.querySelectorAll('.setup-card')].map((card,i)=>({name:card.querySelector('input').value||`Người chơi ${i+1}`,color:card.dataset.color||colors[i%colors.length][0],icon:card.querySelector('.setup-token').textContent.trim()}))}

function render(){
  if(!state)return;
  const active=current(),self=mine();
  $('#room').textContent=`Phòng ${state.code||'DEMO'} · ${state.players.filter(p=>p.connected!==false).length} trực tuyến`;
  $('#turn').textContent=state.phase==='LOBBY'?'Đang chờ':state.phase==='GAME_OVER'?'Kết thúc':`Lượt ${active?.name||'—'} · ${active?.cash||0}Đ`;
  $('#onlineCount').textContent=`${state.players.length} người · Online`;
  $('#setup').hidden=state.phase!=='LOBBY';$('#start').hidden=state.host!==me&&!demo;
  renderPlayers(active);renderBoard(active);renderCenter(active,self);renderActions(active,self);renderHistory();renderAssets(self||active);
}
function renderPlayers(active){
 $('#players').innerHTML=state.players.filter(p=>p.id!==active?.id).map(p=>`<article class="player" style="--c:${p.color}"><span class="icon">${p.icon}</span><b>${esc(p.name)}</b><small>${p.properties.length} đất · ${p.cards?.length||0} thẻ</small></article>`).join('');
}
function renderBoard(active){
 const b=$('#board');b.innerHTML='';
 state.board.forEach((c,i)=>{const [r,col]=boardPos(i),e=document.createElement('button');e.type='button';e.className=`cell ${c.kind}${active?.position===i?' current':''}`;e.style.gridRow=r+1;e.style.gridColumn=col+1;const owner=state.owner?.[i]?state.players.find(p=>p.id===state.owner[i]):null,level=state.level?.[i]||0;e.style.setProperty('--owner',owner?.color||'#d5dfe8');if(level>=5)e.classList.add('hotel');const bar=c.kind==='land'?Array.from({length:5},(_,n)=>`<i style="background:${n<level?(owner?.color||'#90a7b5'):`color-mix(in srgb, ${owner?.color||'#cad6df'} 22%, white)`}"></i>`).join(''):(c.kind==='rail'||c.kind==='utility')?`<i style="background:${owner?.color||'#568bc7'}"></i>`:'';const pawns=state.players.filter(p=>p.position===i&&!p.bankrupt).map(p=>`<span class="pawn ${p.id===active?.id?'active':''}" title="${esc(p.name)}" style="--pawn:${p.color}">${p.icon}</span>`).join('');e.innerHTML=`${bar?`<span class="bar">${bar}</span>`:''}<span class="cell-name">${esc(c.name)}</span><span class="pawns">${pawns}</span>`;if(isOwnTurn(active)&&state.phase==='AWAIT_CARD_ACTION'&&state.pending?.type==='highway'&&c.kind==='land')e.onclick=()=>openSelect('highway');b.append(e)});
}
function renderCenter(active){
 const cell=active&&state.board[active.position],owner=state.owner?.[active?.position],ownerPlayer=owner&&state.players.find(p=>p.id===owner);
 $('#activeInfo').innerHTML=active?`<span class="active-icon" style="--c:${active.color}">${active.icon}</span><div><b style="--c:${active.color}">LƯỢT CỦA ${esc(active.name)} · ${active.cash}Đ</b><small>${active.properties.length} tài sản · ${active.cards?.length||0} thẻ</small></div><strong class="active-cash">${active.properties.length} tài sản<br>${active.cards?.length||0} thẻ</strong>`:'Chưa có người chơi';
 $('#cellName').textContent=state.card?.title||cell?.name||'Chờ bắt đầu';$('#ownerName').textContent=ownerPlayer?`Chủ sở hữu: ${ownerPlayer.icon} ${ownerPlayer.name}`:'';
 const lvl=state.level?.[active?.position]||0;
 if(cell?.kind==='land'){const names=['Đất trống','1 nhà','2 nhà','3 nhà','4 nhà','Khách sạn'];$('#levelLabel').textContent='CẤP NHÀ';$('#levelInfo').textContent=names[lvl];$('#rentLabel').textContent='TIỀN THUÊ';$('#rentInfo').textContent=`${cell.rents?.[lvl]||0}Đ`;}
 else{$('#levelLabel').textContent='Ô ĐANG ĐỨNG';$('#levelInfo').textContent=cell?.kind==='rail'?'Nhà ga':cell?.kind==='utility'?'Nhà máy':cell?.name||'-';$('#rentLabel').textContent='TÌNH TRẠNG';$('#rentInfo').textContent=ownerPlayer?`Chủ ${ownerPlayer.name}`:'-';}
 const dice=$('#dice');if(state.fireResults?.length)dice.innerHTML=state.fireResults.map(x=>`<span class="fire-dice">${x.icon} ${diceHtml(x.dice)}</span>`).join('');else dice.innerHTML=diceHtml(state.lastRoll?.length?state.lastRoll:[3,4]);dice.style.setProperty('--dice-color',active?.color||'#0e9483');
 $('#status').textContent=isOwnTurn(active)?(infoText[state.phase]||'Chờ thao tác tiếp theo.'):`Đang chờ ${active?.name||'người chơi'} thao tác.`;
}
function renderActions(active,self){
 const a=$('#actions');a.innerHTML='';const own=isOwnTurn(active)||demo;$('#openToken').disabled=!own;$('#surrender').disabled=!own;if(!own)return;
 if(state.phase==='TURN'){if(!state.hasRolled||state.extraTurn)addAction(a,state.extraTurn?'Sục lượt đôi tiếp':'Sục','roll');addAction(a,'Ụp / Mở',null,null,'light-button',()=>openAssets(self||active,false));if(state.hasRolled&&!state.extraTurn)addAction(a,'Kết thúc lượt','end-turn');}
 if(state.phase==='AWAIT_BUY'){addAction(a,`${state.pending?.force?'Mua bắt buộc':'Mua'} · ${state.pending.price}Đ`,'buy');if(!state.pending?.force)addAction(a,'Không mua','skip-buy',null,'light-button');}
 if(state.phase==='AWAIT_PAYMENT'){if((active.cash||0)>=state.pending.amount)addAction(a,state.pending?.label?.includes('Thuế')?'Là nó':`Trả ${state.pending.amount}Đ`,'pay',null,'tax-button');else addAction(a,'Xử lý nợ',null,null,'tax-button',()=>openAssets(self||active,true));addAction(a,'Ụp / Mở',null,null,'light-button',()=>openAssets(self||active,(active.cash||0)<state.pending.amount));}
 if(state.phase==='AWAIT_DEBT')addAction(a,'Xử lý nợ',null,null,'tax-button',()=>openAssets(self||active,true));
 if(state.phase==='AWAIT_METRO')addAction(a,'Chọn ô Metro',null,null,'primary',()=>openSelect('metro'));
 if(state.phase==='AWAIT_CARD_ACTION'){
  if(state.pending?.type==='highway')addAction(a,'Chọn ô cao tốc',null,null,'primary',()=>openSelect('highway'));
  else if(state.pending?.type==='highway-confirm')addAction(a,`Xác nhận ${state.pending.label||'cao tốc'}`,'card-action',{});
  else if(state.pending?.type==='construction')addAction(a,state.pending.label||'Chọn đất xây dựng',null,null,'primary',()=>openSelect('construction'));
  else addAction(a,state.pending?.type==='flight'?'Sục hai xúc xắc':'Thực hiện hiệu ứng thẻ','card-action',{});
 }
 if(state.phase==='AWAIT_FIRE_CONFIRM')addAction(a,'Xác nhận cháy nhà','confirm-fire');
}
function addAction(parent,label,event,payload,cls='',fn){const b=document.createElement('button');b.textContent=label;if(cls)b.className=cls;b.onclick=fn||(()=>emit(event,payload));parent.append(b)}
function diceHtml(values){
 return values.map(n=>`<span class="die">${[1,2,3,4,5,6,7,8,9].map(pos=>`<i class="${diePips(n).includes(pos)?'on':''}"></i>`).join('')}</span>`).join('');
}
function diePips(n){return {1:[5],2:[1,9],3:[1,5,9],4:[1,3,7,9],5:[1,3,5,7,9],6:[1,3,4,6,7,9]}[n]||[5]}
function renderHistory(){
 $('#history').innerHTML=(state.history||[]).slice(0,20).map(x=>{const p=state.players.find(y=>y.id===x.playerId)||state.players[0];return `<div class="history-item" style="--actor:${p.color}"><span class="history-player">${p.icon} ${esc(p.name)}</span><span>${esc(x.text)}</span>${x.amount?`<b>${x.amount>0?'+':''}${x.amount}Đ</b>`:'<b></b>'}</div>`}).join('');
}
function openAssets(p,debt){renderAssets(p,debt);$('#assetModal').hidden=false}
function renderAssets(p,debt=false){
 if(!p)return;
 const pending=state.pending||{},need=Number(pending.amount||0),afterPay=p.cash-need;
 $('#assetTitle').textContent=debt?'Xử lý nợ':'Ụp / Mở';
 $('#assetSub').textContent=debt?'Chọn tài sản để tự xoay tiền trả khoản bắt buộc.':'Mỗi lần bấm - / + sẽ áp dụng ngay lên ván.';
 $('#assetTurn').textContent=`Lượt ${p.name} · ${p.cash}Đ`;
 $('#cashBefore').textContent=`${p.cash}Đ`;
 $('#cashAfter').textContent=debt&&need?`${Math.max(afterPay,0)}Đ sau khi trả đủ`:`${p.cash}Đ`;
 $('#debtBox').hidden=!debt;
 $('#debtBox').innerHTML=debt?`<b>KHOẢN BẮT BUỘC PHẢI TRẢ</b><br><strong>${need}Đ</strong><br>Hiện có ${p.cash}Đ · ${p.cash>=need?`đủ trả, còn ${afterPay}Đ`:`còn thiếu ${need-p.cash}Đ`}`:'';
 const items=(p.properties||[]).slice().sort((a,b)=>a-b);
 $('#assetList').innerHTML=items.length?items.map(i=>{
  const c=state.board[i],lvl=state.level?.[i]||0,mortgaged=!!state.mortgaged?.[i];
  const level=c.kind==='land'?(mortgaged?'đang ụp':LEVELS[lvl]||'đất trống'):(mortgaged?'đang ụp':'đang mở');
  const down=downLabel(c,lvl,mortgaged),up=upLabel(c,i,lvl,mortgaged,p);
  return `<article class="asset-row" style="--asset-color:${p.color}"><div class="asset-title">${esc(c.name)} <span>${level}</span></div><div class="asset-actions"><button data-asset="${i}" data-step="-1">${down}</button><button data-asset="${i}" data-step="1" ${up.disabled?'disabled':''}>${up.label}</button></div></article>`;
 }).join(''):`<article class="empty-assets">Bạn chưa có tài sản nào để ụp/mở.</article>`;
 document.querySelectorAll('[data-asset]').forEach(b=>b.onclick=()=>emit('asset-change',{cell:Number(b.dataset.asset),step:Number(b.dataset.step)}));
}
const LEVELS=['đất trống','1 nhà','2 nhà','3 nhà','4 nhà','khách sạn'];
function downLabel(c,lvl,mortgaged){
 if(c.kind==='land'&&lvl>0&&!mortgaged)return `− Hạ +${Math.floor(c.build/2)}Đ`;
 if(!mortgaged)return `− Ụp +${Math.floor((c.price||0)*.5)}Đ`;
 return `− Bán +${Math.floor((c.price||0)*.05)}Đ`;
}
function upLabel(c,i,lvl,mortgaged,p){
 if(mortgaged)return {label:`+ Mở −${Math.floor((c.price||0)*.55)}Đ`,disabled:false};
 if(c.kind!=='land')return {label:'+ Không nâng',disabled:true};
 const standing=p.position===i,lvlMax=lvl>=5;
 return {label:lvlMax?'+ Tối đa':`+ Nâng −${c.build}Đ`,disabled:!standing||lvlMax};
}
function openToken(){const p=mine()||current();tokenChoice={color:p.color,icon:p.icon};$('#oldIcon').textContent=p.icon;drawTokenModal();$('#tokenModal').hidden=false}
function drawTokenModal(){
 $('#tokenColors').innerHTML=colors.map(([hex,label])=>`<span class="color-choice"><button class="${hex===tokenChoice.color?'selected':''}" data-token-color="${hex}" style="background:${hex}"></button>${label}</span>`).join('');
 $('#tokenIcons').innerHTML=icons.map(icon=>`<button class="token-icon ${icon===tokenChoice.icon?'selected':''}" style="--token-color:${tokenChoice.color}" data-token-icon="${icon}">${icon}</button>`).join('');
 $('#tokenPreview').innerHTML=`<span>${tokenChoice.icon}</span>${esc((mine()||current())?.name||'Bạn')} · viền sáng cùng màu`;
 document.querySelectorAll('[data-token-color]').forEach(b=>b.onclick=()=>{tokenChoice.color=b.dataset.tokenColor;drawTokenModal()});
 document.querySelectorAll('[data-token-icon]').forEach(b=>b.onclick=()=>{tokenChoice.icon=b.dataset.tokenIcon;drawTokenModal()});
 if(demo&&document.querySelectorAll('.setup-card')[selectedSetup])document.querySelectorAll('.setup-card')[selectedSetup].querySelector('.setup-token').textContent=tokenChoice.icon;
}
function openSelect(kind){
 const active=current();selectTarget=null;$('#selectModal').hidden=false;$('#selectTurn').textContent=`Lượt ${active?.name||'Linh'} · ${active?.cash||480}Đ`;
 const isHighway=kind==='highway',isConstruction=kind==='construction';
 $('#selectIcon').textContent=isHighway?'🚗':isConstruction?'🏠':'🚆';
 $('#selectTitle').textContent=isHighway?'Khí Vận · Đường cao tốc':isConstruction?'Cơ Hội · Canh bạc xây dựng':'Metro · ô 10';
 $('#selectSub').textContent=isHighway?'Chọn một ô đất rồi bấm xác nhận để sục cao tốc.':isConstruction?'Chọn một mảnh đất hợp lệ rồi bấm xác nhận.':'Chọn ô đích rồi bấm xác nhận, hoặc đứng yên ở ô 10.';
 $('#stayMetro').hidden=state?.phase!=='AWAIT_METRO';
 $('#confirmSelect').textContent=isHighway?'Xác nhận cao tốc':isConstruction?'Xác nhận hiệu ứng':'Xác nhận đi Metro';
 $('#selectPreview').innerHTML='Chọn một ô để xem trước.';
 const choices=state.pending?.choices||[];
 $('#selectGrid').innerHTML=state.board.map((c,i)=>{
  const ok=isHighway?c.kind==='land':isConstruction?choices.includes(i):true;
  return `<button class="select-cell" data-select="${i}" ${ok?'':'disabled'}>${String(i).padStart(2,'0')} ${short(c.name)}</button>`;
 }).join('');
 document.querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>{
  selectTarget=Number(b.dataset.select);document.querySelectorAll('.select-cell').forEach(x=>x.classList.toggle('active',x===b));
  $('#selectPreview').innerHTML=isHighway?`Đã chọn ${short(state.board[selectTarget].name)} · bấm xác nhận để sục 1 viên.`:isConstruction?`${state.pending?.label||'Hiệu ứng'}: ${state.board[selectTarget].name}`:`Xem trước: Metro 10 → ${state.board[selectTarget].name}<br>${active?.cash||480}Đ − ${Math.floor((active?.cash||480)/2)}Đ phí = ${(active?.cash||480)-Math.floor((active?.cash||480)/2)}Đ`;
 });
}
function loadDemo(which){
 state=mockState();showGame();if(which==='lobby'){$('#game').hidden=true;$('#lobby').hidden=false;return}if(which==='metro')state.phase='AWAIT_METRO';if(which==='assets')setTimeout(()=>openAssets(mine(),false),80);if(which==='debt')setTimeout(()=>openAssets(mine(),true),80);if(which==='token')setTimeout(()=>openToken(),80);if(which==='select')setTimeout(()=>openSelect('metro'),80);render();
}
function mockState(){
 const players=['Linh','Minh','An','Vy','Huy','Nam'].map((name,i)=>({id:`demo-${i+1}`,name,color:colors[i%colors.length][0],icon:icons[i],cash:[480,220,360,270,400,310][i],position:[24,7,5,33,31,18][i],properties:[[1,21,24],[3,9,19],[5,25],[6,27,28,35],[8,31,32],[16,18]][i],cards:i%2?[1]:[] ,connected:true}));
 return {code:'DEMO',host:'demo-1',phase:'AWAIT_PAYMENT',players,currentIndex:0,board:BOARD,owner:{1:'demo-1',3:'demo-2',5:'demo-3',6:'demo-4',8:'demo-5',9:'demo-2',16:'demo-6',18:'demo-6',19:'demo-2',21:'demo-1',24:'demo-1',25:'demo-3',27:'demo-4',28:'demo-4',31:'demo-5',32:'demo-5',35:'demo-4'},level:{1:0,8:1,9:2,16:2,18:1,21:2,24:5,31:1,32:1},mortgaged:{21:true,12:true},history:[
  ['Minh mua đất Bitexco',-360,'demo-2'],['Linh nhận tiền người nghèo',100,'demo-1'],['An nộp thuế lợi tức',-150,'demo-3'],['Vy trả thuê Cầu Rồng',-90,'demo-4'],['Huy mua nhà Tháp Rùa',-120,'demo-5'],['Nam qua ô Xuất phát',200,'demo-6'],['Linh mua đất Cầu Rồng',-260,'demo-1'],['Minh trả thuê Đồng Xuân',-130,'demo-2'],['An thẻ Khí Vận: nhận thưởng',60,'demo-3'],['Vy mua đất Đức Bà',-260,'demo-4'],['Huy trả phí thẻ Cơ Hội',-70,'demo-5'],['Nam mua đất Sơn Đoòng',-180,'demo-6'],['Linh qua ô Xuất phát',200,'demo-1'],['Minh thẻ Cơ Hội: nhận thưởng',80,'demo-2'],['An mua đất Đồng Xuân',-140,'demo-3'],['Vy trả thuế lương bổng',-100,'demo-4'],['Huy qua ô Xuất phát',200,'demo-5'],['Nam trả thuê Ga Hà Nội',-90,'demo-6'],['Linh trả phí xây dựng',-40,'demo-1'],['Minh mua đất Hội An',-270,'demo-2']
 ].map((x,i)=>({id:String(i),text:x[0],amount:x[1],playerId:x[2]})),lastRoll:[3,4],pending:{type:'rent',amount:300,label:'Tiền thuê Hội An'},hasRolled:true,extraTurn:false,card:null,fireResults:[]};
}
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function short(v){return String(v).replace('Quảng Trường ','').replace('Nhà Máy ','').replace('Chợ ','').replace('Đồng Xuân','Đồng Xuân').slice(0,14)}
