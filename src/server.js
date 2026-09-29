import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
app.use(express.static(path.join(__dirname, '../public')));
app.get('/health', (_, res) => res.status(200).send('ok'));

const COLORS=['#0f8b7d','#377fc7','#7e50c9','#dc7a3a','#c95187','#cc3e48','#526177','#d2a51d'];
const ICONS=['🍃','🌙','🚗','⛵','🚆','☁️','💨','👟','🎩','🖐️','🐰','🍎','🏠','🧑‍🎓','👩‍🎓','⭐','🚀','💎','🧭','⚡'];
const land=(name,price,build,rents)=>({kind:'land',name,price,build,rents});
const rail=(name)=>({kind:'rail',name,price:200});
const utility=(name)=>({kind:'utility',name,price:150});
const BOARD=[
 {kind:'start',name:'Bắt Đầu'},land('Phố Cổ',60,50,[2,10,30,90,160,250]),{kind:'fortune',name:'Khí Vận'},land('Chợ Đồng Xuân',60,50,[2,10,30,90,160,250]),{kind:'tax',name:'Thuế Lương Bổng',amount:200},rail('Ga Hà Nội'),land('Bưu Điện Hà Nội',100,50,[6,30,90,270,400,550]),{kind:'chance',name:'Cơ Hội'},land('Nhà Hát Lớn',100,50,[6,30,90,270,400,550]),land('Tháp Rùa',120,50,[8,40,100,300,450,600]),
 {kind:'metro',name:'Metro và Tù'},land('Quảng Trường Ba Đình',140,100,[10,50,150,450,625,750]),utility('Nhà Máy Điện'),land('Hoàng Thành',140,100,[10,50,150,450,625,750]),land('Văn Miếu',160,100,[12,60,180,500,700,900]),rail('Ga Vinh'),land('Vịnh Hạ Long',180,100,[14,70,200,550,750,950]),{kind:'fortune',name:'Khí Vận'},land('Sơn Đoòng',180,100,[14,70,200,550,750,950]),land('Tràng An',200,100,[16,80,220,600,800,1000]),
 {kind:'parking',name:'Bãi Đỗ Xe'},land('Cầu Rồng Đà Nẵng',220,150,[18,90,250,700,875,1050]),{kind:'chance',name:'Cơ Hội'},land('Cung Đình Huế',220,150,[18,90,250,700,875,1050]),land('Hội An',240,150,[20,100,300,750,925,1100]),rail('Ga Đà Nẵng'),land('Dinh Độc Lập',260,150,[22,110,330,800,975,1150]),land('Nhà Thờ Đức Bà',260,150,[22,110,330,800,975,1150]),utility('Nhà Máy Nước'),land('Bến Nhà Rồng',280,150,[24,120,360,850,1025,1200]),
 {kind:'jailgo',name:'Vào Tù'},land('Chợ Bến Thành',300,200,[26,130,390,900,1100,1275]),land('Landmark81',300,200,[26,130,390,900,1100,1275]),{kind:'fortune',name:'Khí Vận'},land('Bitexco',320,200,[28,150,450,1000,1200,1400]),rail('Ga Sài Gòn'),{kind:'chance',name:'Cơ Hội'},land('Tháp Chăm',350,200,[35,175,500,1100,1300,1500]),{kind:'tax',name:'Thuế Lợi Tức',amount:100},land('Phú Quốc',400,200,[50,200,600,1400,1700,2000])
];
const rooms=new Map();
const roll=()=>1+Math.floor(Math.random()*6);
const code=()=>Math.random().toString(36).slice(2,7).toUpperCase();
const log=(room,text,amount=0,playerId=null)=>room.history.unshift({id:crypto.randomUUID(),text,amount,playerId,at:Date.now()})&&room.history.splice(20);
const playerPublic=p=>({...p,connected:!!p.socketId});
function publicRoom(room){return {...room,players:room.players.map(playerPublic),board:BOARD};}
function emit(room){io.to(room.code).emit('state',publicRoom(room));}
function current(room){return room.players[room.currentIndex];}
function assertTurn(room,id){if(room.phase==='GAME_OVER') throw Error('Ván đã kết thúc.'); if(current(room)?.id!==id) throw Error('Chỉ người đang chơi được thao tác.');}
function ownedBy(room,cell,player){return player.properties.includes(cell);}
function addCash(p,n){p.cash+=n;}
function bankrupt(room,p,why){p.bankrupt=true; room.phase='GAME_OVER'; log(room,`${p.name} phá sản: ${why}.`,0,p.id);}
function transfer(room,from,to,amount,reason){
 if(from.cash<amount){bankrupt(room,from,reason); return false;}
 from.cash-=amount; to.cash+=amount; log(room,`${from.name} trả ${amount}Đ ${reason} cho ${to.name}.`,-amount,from.id); return true;
}
function move(room,p,steps,{awardStart=true}={}){let old=p.position; p.position=(p.position+steps+400)%40; if(steps>0 && awardStart && (old+steps>=40)){p.cash+=200;log(room,`${p.name} đi qua Bắt Đầu.`,200,p.id);}}
function railRent(room,owner){return [25,50,100,200][room.players.flatMap(p=>p.properties).filter(i=>BOARD[i].kind==='rail'&&room.owner[i]===owner.id).length-1]||25;}
function utilityRent(room,owner){const n=room.players.flatMap(p=>p.properties).filter(i=>BOARD[i].kind==='utility'&&room.owner[i]===owner.id).length; return (room.lastRoll.reduce((a,b)=>a+b,0))*(n>1?10:4);}
function playerLands(p){return p.properties.filter(i=>BOARD[i]?.kind==='land');}
function playerRails(p){return p.properties.filter(i=>BOARD[i]?.kind==='rail');}
function cheapestLand(p){return playerLands(p).sort((a,b)=>BOARD[a].price-BOARD[b].price||a-b)[0];}
function nearestAhead(p,kind){
 for(let step=1;step<=40;step++){const i=(p.position+step)%40;if(BOARD[i].kind===kind)return i;}
}
function nearestRailOrUtilityAhead(room,p,owner){
 for(let step=1;step<=40;step++){const i=(p.position+step)%40;if(['rail','utility'].includes(BOARD[i].kind)&&room.owner[i]===owner.id)return i;}
}
function swapOwners(room,a,b,pa,pb){
 room.owner[a]=pb.id; room.owner[b]=pa.id;
 pa.properties=pa.properties.filter(x=>x!==a).concat(b).sort((x,y)=>x-y);
 pb.properties=pb.properties.filter(x=>x!==b).concat(a).sort((x,y)=>x-y);
}
function payOrBankrupt(room,from,to,amount,reason){
 if(from.cash<amount){bankrupt(room,from,reason);return false;}
 from.cash-=amount;if(to)to.cash+=amount;log(room,`${from.name} trả ${amount}Đ ${reason}${to?` cho ${to.name}`:''}.`,-amount,from.id);return true;
}
function goTo(room,p,target,{awardStart=true}={}){
 const steps=(target-p.position+40)%40;
 if(steps===0){p.position=target;return;}
 move(room,p,steps,{awardStart});
}
function paySpecialRent(room,p,target,amount,label){
 const ownerId=room.owner[target],owner=ownerId&&room.players.find(x=>x.id===ownerId);
 if(!ownerId||ownerId===p.id||room.mortgaged[target]){room.phase='TURN';return;}
 room.pending={type:'rent',amount,recipient:owner.id,label};
 room.phase='AWAIT_PAYMENT';
}
function resolveNearestPropertyCard(room,p,kind,label){
 const target=nearestAhead(p,kind);
 goTo(room,p,target);
 const ownerId=room.owner[target];
 if(!ownerId){room.phase='AWAIT_BUY';room.pending={type:'buy',cell:target,price:BOARD[target].price,force:true,label};return;}
 if(ownerId===p.id||room.mortgaged[target]){room.phase='TURN';return;}
 const a=roll(),b=roll();room.lastRoll=[a,b];paySpecialRent(room,p,target,10*(a+b),label);
}
function resolve(room,p){
 const cell=BOARD[p.position]; room.pending=null;
 if(cell.kind==='start'||cell.kind==='parking'){room.phase='TURN';log(room,`${p.name} dừng tại ${cell.name}.`,0,p.id);return;}
 if(cell.kind==='jailgo'){p.position=10;p.jailed=true;room.phase='TURN';log(room,`${p.name} vào Tù.`,0,p.id);return;}
 if(cell.kind==='tax'){room.phase='AWAIT_PAYMENT';room.pending={type:'tax',amount:cell.amount,label:cell.name};return;}
 if(cell.kind==='metro'){room.phase=p.jailed?'AWAIT_JAIL':'AWAIT_METRO';return;}
 if(cell.kind==='chance'||cell.kind==='fortune'){drawCard(room,p,cell.kind);return;}
 if(['land','rail','utility'].includes(cell.kind)){
   const ownerId=room.owner[p.position];
   if(!ownerId){room.phase='AWAIT_BUY';room.pending={type:'buy',cell:p.position,price:cell.price};return;}
   if(ownerId===p.id){room.phase='TURN';return;}
   const owner=room.players.find(x=>x.id===ownerId); if(room.mortgaged[p.position]){room.phase='TURN';return;}
   if(p.rentPass){p.rentPass=false;room.phase='TURN';log(room,`${p.name} dùng thẻ miễn thuê tại ${cell.name}.`,0,p.id);return;}
   const amount=cell.kind==='land'?cell.rents[room.level[p.position]||0]:cell.kind==='rail'?railRent(room,owner):utilityRent(room,owner);
   room.phase='AWAIT_PAYMENT';room.pending={type:'rent',amount,recipient:owner.id,label:`Tiền thuê ${cell.name}`};return;
 }
}
function drawCard(room,p,type){
 const chance=[
  {t:'Đi đến Ga Sài Gòn',go:35},{t:'Đi đến Phú Quốc',go:39},{t:'Đất gần nhất',action:'nearest-land'},
  {t:'Đi đến Bưu Điện Hà Nội',go:6},{t:'Tàu bay xúc xắc',action:'flight'},{t:'Trả tiền điện',action:'electric-fee'},
  {t:'Về điểm xuất phát',go:0,startBonus:true},{t:'Miễn thuế nhà đất',action:'rent-pass'},{t:'Xổ số kiến thiết',action:'lottery'},
  {t:'Đến ga gần nhất',action:'nearest-rail'},{t:'Hỏng đường ray',action:'rail-fee'},{t:'Đi đến Tháp Rùa',go:9},
  {t:'Diễn kịch giỏi',cash:50},{t:'Nhảy lò cò',move:-3},{t:'Vào tù là rõ',action:'jail'},
  {t:'Đi đến Landmark81',go:32},{t:'Người thủ đô',action:'capital'},{t:'Canh bạc xây dựng',action:'construction'},{t:'Cháy nhà hàng xóm',action:'fire'}];
 const fortune=[{t:'Thần tài ban lộc',cash:100},{t:'Quá ngây thơ',cash:-50},{t:'Ngân hàng tái cơ cấu',action:'restructure'},{t:'Mở đường cao tốc',action:'highway'},{t:'Thằng Bờm đổi quạt mo',action:'bom'}];
 const card=(type==='chance'?chance:fortune)[Math.floor(Math.random()*(type==='chance'?chance:fortune).length)];
 room.card={type,title:card.t,by:p.id};log(room,`${p.name} rút ${type==='chance'?'Cơ Hội':'Khí Vận'}: ${card.t}.`,0,p.id);
 if(card.cash){if(card.cash<0&&p.cash<-card.cash){room.pending={type:'bank',amount:-card.cash,label:card.t};room.phase='AWAIT_PAYMENT';return;}p.cash+=card.cash;room.phase='TURN';return;}
 if(card.go!==undefined){if(card.go===0&&card.startBonus){p.position=0;p.cash+=200;log(room,`${p.name} về Bắt Đầu.`,200,p.id);room.phase='TURN';return;}goTo(room,p,card.go);resolve(room,p);return;}
 if(card.move){move(room,p,card.move,{awardStart:false});resolve(room,p);return;}
 if(card.action==='jail'){p.position=10;p.jailed=true;room.phase='TURN';return;}
 if(card.action==='capital'){if(ownedBy(room,1,p))p.capitalPass=true;room.phase='TURN';return;}
 if(card.action==='rent-pass'){p.rentPass=true;room.phase='TURN';return;}
 if(card.action==='lottery'){const d=roll(),cash=d===1||d===4?5:d===2||d===5?50:150;room.lastRoll=[d];p.cash+=cash;log(room,`${p.name} xổ số ra ${d}, nhận ${cash}Đ.`,cash,p.id);room.phase='TURN';return;}
 if(card.action==='nearest-land'){resolveNearestPropertyCard(room,p,'land','Đất gần nhất');return;}
 if(card.action==='nearest-rail'){resolveNearestPropertyCard(room,p,'rail','Ga gần nhất');return;}
 if(card.action==='electric-fee'){
  const houses=playerLands(p).reduce((s,i)=>{const lvl=room.level[i]||0;return s+(lvl>0&&lvl<5?lvl:0);},0),hotels=playerLands(p).filter(i=>(room.level[i]||0)>=5).length;
  const amount=houses*25+hotels*100,ownerId=room.owner[12],owner=ownerId&&room.players.find(x=>x.id===ownerId),recipientAmount=owner&&!room.mortgaged[12]?Math.floor(amount*.2):0;
  if(amount<=0){room.phase='TURN';log(room,`${p.name} không có nhà để trả tiền điện.`,0,p.id);return;}
  room.pending={type:'fee',amount,recipient:recipientAmount?owner.id:null,recipientAmount,label:'Trả tiền điện'};room.phase='AWAIT_PAYMENT';return;
 }
 if(card.action==='rail-fee'){
  const n=playerRails(p).length,amount=[0,25,50,100,200][n]||200;
  if(amount<=0){room.phase='TURN';log(room,`${p.name} không có ga để trả phí đường ray.`,0,p.id);return;}
  room.pending={type:'fee',amount,label:'Hỏng đường ray'};room.phase='AWAIT_PAYMENT';return;
 }
 if(card.action==='restructure'){const avg=Math.floor(room.players.reduce((s,x)=>s+x.cash,0)/room.players.length);p.cash=avg;room.phase='TURN';return;}
 if(card.action==='construction'){
  const avg=room.players.reduce((s,x)=>s+playerLands(x).length,0)/room.players.length,lands=playerLands(p);
  const mode=lands.length<avg?'up':lands.length>avg?'down':'none';
  const choices=mode==='up'?lands.filter(i=>(room.level[i]||0)<5&&!room.mortgaged[i]):mode==='down'?lands.filter(i=>(room.level[i]||0)>0):[];
  room.fireResults=room.players.filter(x=>!x.bankrupt).map(x=>({playerId:x.id,name:x.name,icon:x.icon,position:x.position,dice:[roll(),roll()]}));
  if(!choices.length){log(room,`${p.name} Canh bạc xây dựng: không có đất hợp lệ.`,0,p.id);room.phase='TURN';return;}
  room.phase='AWAIT_CARD_ACTION';room.pending={type:'construction',mode,choices,label:mode==='up'?'Chọn đất để nâng miễn phí':'Chọn đất để hạ 1 cấp'};return;
 }
 room.phase='AWAIT_CARD_ACTION';room.pending={type:card.action};
}
function nextTurn(room){
 if(room.phase==='GAME_OVER')return;
 room.currentIndex=(room.currentIndex+1)%room.players.length;room.phase='TURN';room.lastRoll=[];room.card=null;room.pending=null;room.hasRolled=false;room.extraTurn=false;room.fireResults=[];
 log(room,`Lượt ${current(room).name}.`,0,current(room).id);
}
function makeRoom(host,config){let c;do c=code();while(rooms.has(c));const limit=Math.max(2,Math.min(6,Number(config.limit)||4));const p={id:host.id,socketId:host.socketId,name:config.name||'Chủ phòng',color:COLORS[0],icon:ICONS[0],cash:500,position:0,properties:[],jailed:false,bankrupt:false,capitalPass:false}; const r={code:c,host:p.id,limit,phase:'LOBBY',players:[p],currentIndex:0,owner:{},level:{},mortgaged:{},history:[],lastRoll:[],pending:null,card:null,hasRolled:false,extraTurn:false,fireResults:[]};rooms.set(c,r);log(r,`${p.name} tạo phòng ${c}.`,0,p.id);return r;}
function joinRoom(socket,config){const r=rooms.get(config.code?.toUpperCase());if(!r)throw Error('Không tìm thấy phòng.');if(r.phase!=='LOBBY')throw Error('Ván đã bắt đầu.');if(r.players.length>=r.limit)throw Error('Phòng đã đủ người.');const p={id:socket.id,socketId:socket.id,name:config.name||`Người chơi ${r.players.length+1}`,color:COLORS[r.players.length],icon:ICONS[r.players.length],cash:500,position:0,properties:[],jailed:false,bankrupt:false,capitalPass:false};r.players.push(p);log(r,`${p.name} vào phòng.`,0,p.id);return r;}
function action(socket,fn){try{const room=[...rooms.values()].find(r=>r.players.some(p=>p.id===socket.id));if(!room)throw Error('Bạn chưa ở trong phòng.');fn(room);emit(room);}catch(e){socket.emit('notice',{type:'error',text:e.message});}}

io.on('connection',socket=>{
 socket.on('create-room',cfg=>{try{const r=makeRoom({id:socket.id,socketId:socket.id},cfg||{});socket.join(r.code);emit(r);}catch(e){socket.emit('notice',{type:'error',text:e.message});}});
 socket.on('join-room',cfg=>{try{const r=joinRoom(socket,cfg||{});socket.join(r.code);emit(r);}catch(e){socket.emit('notice',{type:'error',text:e.message});}});
 socket.on('setup-player',cfg=>action(socket,r=>{if(r.phase!=='LOBBY')throw Error('Không thể đổi sau khi bắt đầu.');const p=r.players.find(x=>x.id===socket.id);p.name=(cfg.name||p.name).trim().slice(0,18);if(COLORS.includes(cfg.color)&&!r.players.some(x=>x.id!==p.id&&x.color===cfg.color))p.color=cfg.color;if(ICONS.includes(cfg.icon))p.icon=cfg.icon;}));
 socket.on('start-game',()=>action(socket,r=>{if(r.host!==socket.id)throw Error('Chỉ chủ phòng được bắt đầu.');if(r.phase!=='LOBBY')throw Error('Ván đã bắt đầu.');if(r.players.length<2)throw Error('Cần ít nhất 2 người chơi.');r.phase='TURN';r.hasRolled=false;log(r,`Bắt đầu ván đấu với ${r.players.length} người chơi.`,0,socket.id);}));
 socket.on('roll',()=>action(socket,r=>{assertTurn(r,socket.id);if(r.phase!=='TURN')throw Error('Hãy hoàn tất thao tác hiện tại trước khi sục.');const p=current(r);if(r.hasRolled&&!r.extraTurn)throw Error('Bạn đã sục trong lượt này.');if(p.jailed){const a=roll(),b=roll();r.lastRoll=[a,b];p.jailTurns=(p.jailTurns||0)+1;if(a===b){p.jailed=false;p.jailTurns=0;r.hasRolled=true;r.extraTurn=false;move(r,p,a+b);resolve(r,p);}else if(p.jailTurns>=3){r.hasRolled=true;r.extraTurn=false;r.pending={type:'jail',amount:50,move:a+b,label:'Trả phí để ra tù'};r.phase='AWAIT_JAIL_PAYMENT';}else{nextTurn(r);}return;}const a=roll(),b=roll();r.lastRoll=[a,b];r.hasRolled=true;move(r,p,a+b);resolve(r,p);if(a===b&&r.phase!=='GAME_OVER'){p.doubleCount=(p.doubleCount||0)+1;if(p.doubleCount>=3){p.position=10;p.jailed=true;p.doubleCount=0;r.extraTurn=false;log(r,`${p.name} đổ đôi 3 lần và vào Tù.`,0,p.id);}else{r.extraTurn=true;r.hasRolled=false;}}else{p.doubleCount=0;r.extraTurn=false;}}));
 socket.on('buy',()=>action(socket,r=>{assertTurn(r,socket.id);if(r.phase!=='AWAIT_BUY')throw Error('Không có tài sản để mua.');const p=current(r),i=r.pending.cell,c=BOARD[i];if(p.cash<c.price){if(r.pending.force){r.pending={...r.pending,type:'buy',amount:c.price,label:`Mua bắt buộc ${c.name}`};r.phase='AWAIT_DEBT';return;}throw Error('Không đủ tiền mua.');}p.cash-=c.price;p.properties.push(i);r.owner[i]=p.id;log(r,`${p.name} mua ${c.name}.`,-c.price,p.id);r.phase='TURN';r.pending=null;}));
 socket.on('skip-buy',()=>action(socket,r=>{assertTurn(r,socket.id);if(r.phase!=='AWAIT_BUY')throw Error('Không có lựa chọn mua.');if(r.pending?.force)throw Error('Thẻ này bắt buộc mua nếu ô chưa có chủ.');r.phase='TURN';r.pending=null;}));
 socket.on('pay',()=>action(socket,r=>{assertTurn(r,socket.id);if(r.phase!=='AWAIT_PAYMENT')throw Error('Không có khoản phải trả.');const p=current(r),pending=r.pending;if(p.cash<pending.amount){r.phase='AWAIT_DEBT';return;}if(pending.type==='tax'&&p.capitalPass&&(p.position===4||p.position===38)){p.capitalPass=false;log(r,`${p.name} dùng quyền Người thủ đô để miễn thuế.`,0,p.id);}else{p.cash-=pending.amount;if(pending.recipient){const receiver=r.players.find(x=>x.id===pending.recipient),give=pending.recipientAmount??pending.amount;if(receiver)receiver.cash+=give;}log(r,`${p.name} trả ${pending.amount}Đ ${pending.label||''}.`,-pending.amount,p.id);}r.phase='TURN';r.pending=null;}));
 socket.on('pay-jail',()=>action(socket,r=>{assertTurn(r,socket.id);const p=current(r);if(r.phase==='TURN'&&p.jailed){if(p.cash<50){r.phase='AWAIT_DEBT';r.pending={type:'jail',amount:50,label:'Tiền bảo lãnh'};return;}p.cash-=50;p.jailed=false;p.jailTurns=0;r.hasRolled=false;r.extraTurn=false;log(r,`${p.name} trả 50Đ bảo lãnh.`,-50,p.id);return;}if(r.phase!=='AWAIT_JAIL_PAYMENT'||!p.jailed)throw Error('Không có phí ra tù cần thanh toán.');if(p.cash<50){r.phase='AWAIT_DEBT';return;}p.cash-=50;p.jailed=false;p.jailTurns=0;log(r,`${p.name} trả 50Đ bảo lãnh và di chuyển.`,-50,p.id);const steps=r.pending.move||0;r.pending=null;r.hasRolled=true;r.extraTurn=false;move(r,p,steps);resolve(r,p);}));
 socket.on('metro',target=>action(socket,r=>{assertTurn(r,socket.id);if(r.phase!=='AWAIT_METRO')throw Error('Metro không khả dụng.');const p=current(r);if(target===null){r.phase='TURN';return;}if(!Number.isInteger(target)||target<0||target>39)throw Error('Ô Metro không hợp lệ.');const fee=Math.floor(p.cash/2);p.cash-=fee;p.position=target;log(r,`${p.name} dùng Metro đến ${BOARD[target].name}.`,-fee,p.id);resolve(r,p);}));
 socket.on('card-action',data=>action(socket,r=>{
  assertTurn(r,socket.id);if(r.phase!=='AWAIT_CARD_ACTION')throw Error('Không có thẻ cần xử lý.');
  const p=current(r),t=r.pending.type;
  if(t==='flight'){const a=roll(),b=roll();r.lastRoll=[a,b];move(r,p,a%2?-a:a,{awardStart:true});move(r,p,b%2?-b:b,{awardStart:true});r.hasRolled=true;r.extraTurn=false;resolve(r,p);return;}
  if(t==='highway'){const base=data?.target;if(!Number.isInteger(base)||BOARD[base].kind!=='land')throw Error('Hãy chọn một ô đất.');const d=roll(),dest=(base+(d<=3?d*10:0))%40;r.lastRoll=[d];r.pending={type:'highway-confirm',base,d,dest,label:`${BOARD[base].name} → ${BOARD[dest].name}`};log(r,`${p.name} sục cao tốc: ${d}.`,0,p.id);return;}
  if(t==='highway-confirm'){const dest=r.pending.dest;p.position=dest;log(r,`${p.name} xác nhận cao tốc đến ${BOARD[dest].name}.`,0,p.id);r.hasRolled=true;r.extraTurn=false;resolve(r,p);return;}
  if(t==='construction'){
   const avg=r.players.reduce((s,x)=>s+playerLands(x).length,0)/r.players.length,lands=playerLands(p);
   const mode=lands.length<avg?'up':lands.length>avg?'down':'none';
   const choices=mode==='up'?lands.filter(i=>(r.level[i]||0)<5&&!r.mortgaged[i]):mode==='down'?lands.filter(i=>(r.level[i]||0)>0):[];
   if(!choices.length){log(r,`${p.name} Canh bạc xây dựng: không có đất hợp lệ.`,0,p.id);r.phase='TURN';r.pending=null;return;}
   const target=data?.target;if(!Number.isInteger(target)){r.pending={type:'construction',mode,choices,label:mode==='up'?'Chọn đất để nâng miễn phí':'Chọn đất để hạ 1 cấp'};return;}
   if(!choices.includes(target))throw Error('Hãy chọn một mảnh đất hợp lệ.');
   if(mode==='up')r.level[target]=Math.min(5,(r.level[target]||0)+1);else r.level[target]=Math.max(0,(r.level[target]||0)-1);
   log(r,`${p.name} ${mode==='up'?'nâng miễn phí':'hạ'} ${BOARD[target].name} do Canh bạc xây dựng.`,0,p.id);r.phase='TURN';r.pending=null;return;
  }
  if(t==='fire'){r.fireResults=r.players.filter(x=>!x.bankrupt).map(x=>({playerId:x.id,name:x.name,icon:x.icon,position:x.position,dice:[roll(),roll()]}));const total=r.fireResults.reduce((sum,x)=>sum+x.dice[0]+x.dice[1],0);r.fireTarget=(p.position+total)%40;r.lastRoll=[total];r.pending={type:'fire',target:r.fireTarget,total,label:`Tổng xúc xắc ${total} · ô ${String(r.fireTarget).padStart(2,'0')}`};r.phase='AWAIT_FIRE_CONFIRM';return;}
  if(t==='bom'){
   const opponents=r.players.filter(x=>x.id!==p.id&&!x.bankrupt);if(!opponents.length){r.phase='TURN';r.pending=null;return;}
   let first=roll(),guard=0;while(first>=r.players.length&&guard++<20)first=roll();
   const second=roll(),other=opponents[(first-1)%opponents.length];r.lastRoll=[first,second];
   if(second%2===0){const a=cheapestLand(p),b=cheapestLand(other);if(a!==undefined&&b!==undefined){swapOwners(r,a,b,p,other);log(r,`${p.name} đổi ${BOARD[a].name} lấy ${BOARD[b].name} của ${other.name}.`,0,p.id);}else payOrBankrupt(r,other,p,100,'do Thằng Bờm');}
   else{const a=cheapestLand(p),b=nearestRailOrUtilityAhead(r,p,other);if(a!==undefined&&b!==undefined){swapOwners(r,a,b,p,other);log(r,`${p.name} đổi ${BOARD[a].name} lấy ${BOARD[b].name} của ${other.name}.`,0,p.id);}else payOrBankrupt(r,other,p,100,'do Thằng Bờm');}
   if(r.phase!=='GAME_OVER'){r.phase='TURN';r.pending=null;}return;
  }
  throw Error('Thẻ này chưa có thao tác.');
 }));
 socket.on('confirm-fire',()=>action(socket,r=>{assertTurn(r,socket.id);if(r.phase!=='AWAIT_FIRE_CONFIRM'||r.pending?.type!=='fire')throw Error('Không có kết quả Cháy nhà cần xác nhận.');const i=r.pending.target;if(BOARD[i]?.kind==='land'&&(r.level[i]||0)>0){r.level[i]--;log(r,`${current(r).name} xác nhận Cháy nhà tại ${BOARD[i].name}.`,0,current(r).id);}else log(r,`${current(r).name} xác nhận Cháy nhà: ô ${BOARD[i]?.name||i} không có nhà để hạ.`,0,current(r).id);r.phase='TURN';r.pending=null;r.fireTarget=null;r.fireResults=[];}));
 socket.on('asset-change',data=>action(socket,r=>{
  assertTurn(r,socket.id);if(!['TURN','AWAIT_PAYMENT','AWAIT_DEBT','AWAIT_JAIL_PAYMENT'].includes(r.phase))throw Error('Chưa thể thay đổi tài sản lúc này.');
  const p=current(r),i=data?.cell,step=data?.step,c=BOARD[i];if(!Number.isInteger(i)||![-1,1].includes(step)||!ownedBy(r,i,p)||!c)throw Error('Tài sản không hợp lệ.');
  if(step<0){
   if(c.kind==='land'&&(r.level[i]||0)>0){r.level[i]--;const value=Math.floor(c.build/2);p.cash+=value;log(r,`${p.name} hạ cấp ${c.name} để lấy ${value}Đ.`,value,p.id);}
   else if(!r.mortgaged[i]){r.mortgaged[i]=true;const value=Math.floor(c.price*.5);p.cash+=value;log(r,`${p.name} cắm ${c.name}, nhận ${value}Đ.`,value,p.id);}
   else{const value=Math.floor(c.price*.05);p.cash+=value;p.properties=p.properties.filter(x=>x!==i);delete r.owner[i];delete r.mortgaged[i];delete r.level[i];log(r,`${p.name} bán ${c.name}, nhận ${value}Đ.`,value,p.id);}
  }else if(r.mortgaged[i]){
   const value=Math.floor(c.price*.55);if(p.cash<value)throw Error(`Cần ${value}Đ để mở cắm tài sản.`);p.cash-=value;delete r.mortgaged[i];log(r,`${p.name} mở cắm ${c.name}, trả ${value}Đ.`,-value,p.id);
  }else if(c.kind==='land'){
   if(p.position!==i)throw Error('Chỉ được nâng cấp khi đang đứng trên chính ô đất đó.');
   const lvl=r.level[i]||0;if(lvl>=5)throw Error('Tài sản đã ở cấp tối đa.');if(p.cash<c.build)throw Error(`Cần ${c.build}Đ để nâng cấp.`);p.cash-=c.build;r.level[i]=lvl+1;log(r,`${p.name} nâng ${c.name} thêm một cấp.`,-c.build,p.id);
  }else throw Error('Tài sản này không thể nâng cấp.');
  if(r.phase==='AWAIT_DEBT'&&r.pending?.amount&&p.cash>=r.pending.amount)r.phase=r.pending.type==='jail'?'AWAIT_JAIL_PAYMENT':r.pending.type==='buy'?'AWAIT_BUY':'AWAIT_PAYMENT';
 }));
 socket.on('declare-bankruptcy',()=>action(socket,r=>{assertTurn(r,socket.id);if(r.phase!=='AWAIT_DEBT')throw Error('Chưa có khoản nợ cần xử lý.');const p=current(r);if(p.properties.length)throw Error('Hãy hạ cấp, cắm hoặc bán hết tài sản trước.');bankrupt(r,p,r.pending?.label||'không thể thanh toán khoản nợ');}));
 socket.on('change-token',data=>action(socket,r=>{assertTurn(r,socket.id);if(r.phase!=='TURN')throw Error('Đổi quân chỉ thực hiện trong lượt của bạn.');const p=current(r);if(!COLORS.includes(data?.color)||!ICONS.includes(data?.icon))throw Error('Màu hoặc biểu tượng không hợp lệ.');if(r.players.some(x=>x.id!==p.id&&x.color===data.color))throw Error('Màu này đang được người khác dùng.');const old=p.icon;p.color=data.color;p.icon=data.icon;log(r,`${p.name} đổi biểu tượng ${old} thành ${p.icon}.`,0,p.id);}));
 socket.on('end-turn',()=>action(socket,r=>{assertTurn(r,socket.id);if(r.phase!=='TURN')throw Error('Hãy hoàn tất thao tác bắt buộc.');if(r.extraTurn)throw Error('Bạn đã đổ đôi và được sục tiếp.');if(!r.hasRolled)throw Error('Hãy sục trước khi kết thúc lượt.');nextTurn(r);}));
 socket.on('surrender',()=>action(socket,r=>{assertTurn(r,socket.id);if(r.phase!=='TURN')throw Error('Chỉ đầu hàng khi không còn thao tác bắt buộc đang mở.');const p=current(r);bankrupt(r,p,'đầu hàng');}));
 socket.on('disconnect',()=>{for(const r of rooms.values()){const p=r.players.find(x=>x.id===socket.id);if(p){p.socketId=null;emit(r);}}});
});
server.listen(PORT,HOST,()=>console.log(`Cờ Tỷ Phú chạy tại ${HOST}:${PORT}`));
