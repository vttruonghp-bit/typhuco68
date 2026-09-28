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
app.use(express.static(path.join(__dirname, '../public')));
app.get('/health', (_, res) => res.status(200).send('ok'));

const COLORS=['#0f8b7d','#377fc7','#7e50c9','#dc7a3a','#c95187','#cc3e48','#526177','#d2a51d'];
const ICONS=['🍃','🌙','🚗','⛵','🚆','☁️','💨','👟','🎩','🖐️','🐰','🍎','🏠','🧑‍🎓','👩‍🎓','✚','☸','⚒','⭐','🚀'];
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
function assertTurn(room,id){if(room.phase==='GAME_OVER') throw Error('Ván đã kết thúc.'); if(current(room)?.id!==id) throw Error('Chưa đến lượt bạn.');}
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
   const amount=cell.kind==='land'?cell.rents[room.level[p.position]||0]:cell.kind==='rail'?railRent(room,owner):utilityRent(room,owner);
   transfer(room,p,owner,amount,`tiền thuê ${cell.name}`);room.phase=room.phase==='GAME_OVER'?'GAME_OVER':'TURN';return;
 }
}
function drawCard(room,p,type){
 const chance=[
  {t:'Đi đến Ga Sài Gòn',go:35},{t:'Đi đến Phú Quốc',go:39},{t:'Tàu bay xúc xắc',action:'flight'},
  {t:'Diễn kịch giỏi',cash:50},{t:'Nhảy lò cò',move:-3},{t:'Vào tù là rõ',action:'jail'},
  {t:'Người thủ đô',action:'capital'},{t:'Canh bạc xây dựng',action:'construction'},{t:'Cháy nhà hàng xóm',action:'fire'}];
 const fortune=[{t:'Thần tài ban lộc',cash:100},{t:'Quá ngây thơ',cash:-50},{t:'Ngân hàng tái cơ cấu',action:'restructure'},{t:'Mở đường cao tốc',action:'highway'},{t:'Thằng Bờm đổi quạt mo',action:'bom'}];
 const card=(type==='chance'?chance:fortune)[Math.floor(Math.random()*(type==='chance'?chance:fortune).length)];
 room.card={type,title:card.t,by:p.id};log(room,`${p.name} rút ${type==='chance'?'Cơ Hội':'Khí Vận'}: ${card.t}.`,0,p.id);
 if(card.cash){if(card.cash<0&&p.cash<-card.cash){bankrupt(room,p,card.t);return;}p.cash+=card.cash;room.phase='TURN';return;}
 if(card.go!==undefined){move(room,p,(card.go-p.position+40)%40);resolve(room,p);return;}
 if(card.move){move(room,p,card.move,{awardStart:false});resolve(room,p);return;}
 if(card.action==='jail'){p.position=10;p.jailed=true;room.phase='TURN';return;}
 if(card.action==='capital'){if(ownedBy(room,1,p))p.capitalPass=true;room.phase='TURN';return;}
 if(card.action==='restructure'){const avg=Math.floor(room.players.reduce((s,x)=>s+x.cash,0)/room.players.length);p.cash=avg;room.phase='TURN';return;}
 room.phase='AWAIT_CARD_ACTION';room.pending={type:card.action};
}
function nextTurn(room){
 if(room.phase==='GAME_OVER')return;
 room.currentIndex=(room.currentIndex+1)%room.players.length;room.phase='TURN';room.lastRoll=[];room.card=null;room.pending=null;
 log(room,`Lượt ${current(room).name}.`,0,current(room).id);
}
function makeRoom(host,config){let c;do c=code();while(rooms.has(c));const p={id:host.id,socketId:host.socketId,name:config.name||'Chủ phòng',color:COLORS[0],icon:ICONS[0],cash:500,position:0,properties:[],jailed:false,bankrupt:false,capitalPass:false}; const r={code:c,host:p.id,limit:config.limit||4,phase:'LOBBY',players:[p],currentIndex:0,owner:{},level:{},mortgaged:{},history:[],lastRoll:[],pending:null,card:null};rooms.set(c,r);log(r,`${p.name} tạo phòng ${c}.`,0,p.id);return r;}
function joinRoom(socket,config){const r=rooms.get(config.code?.toUpperCase());if(!r)throw Error('Không tìm thấy phòng.');if(r.phase!=='LOBBY')throw Error('Ván đã bắt đầu.');if(r.players.length>=r.limit)throw Error('Phòng đã đủ người.');const p={id:socket.id,socketId:socket.id,name:config.name||`Người chơi ${r.players.length+1}`,color:COLORS[r.players.length],icon:ICONS[r.players.length],cash:500,position:0,properties:[],jailed:false,bankrupt:false,capitalPass:false};r.players.push(p);log(r,`${p.name} vào phòng.`,0,p.id);return r;}
function action(socket,fn){try{const room=[...rooms.values()].find(r=>r.players.some(p=>p.id===socket.id));if(!room)throw Error('Bạn chưa ở trong phòng.');fn(room);emit(room);}catch(e){socket.emit('notice',{type:'error',text:e.message});}}

io.on('connection',socket=>{
 socket.on('create-room',cfg=>{try{const r=makeRoom({id:socket.id,socketId:socket.id},cfg||{});socket.join(r.code);emit(r);}catch(e){socket.emit('notice',{type:'error',text:e.message});}});
 socket.on('join-room',cfg=>{try{const r=joinRoom(socket,cfg||{});socket.join(r.code);emit(r);}catch(e){socket.emit('notice',{type:'error',text:e.message});}});
 socket.on('setup-player',cfg=>action(socket,r=>{if(r.phase!=='LOBBY')throw Error('Không thể đổi sau khi bắt đầu.');const p=r.players.find(x=>x.id===socket.id);p.name=(cfg.name||p.name).trim().slice(0,18);if(COLORS.includes(cfg.color)&&!r.players.some(x=>x.id!==p.id&&x.color===cfg.color))p.color=cfg.color;if(ICONS.includes(cfg.icon))p.icon=cfg.icon;}));
 socket.on('start-game',()=>action(socket,r=>{if(r.host!==socket.id)throw Error('Chỉ chủ phòng được bắt đầu.');if(r.players.length<2)throw Error('Cần ít nhất 2 người chơi.');r.phase='TURN';log(r,`Bắt đầu ván đấu với ${r.players.length} người chơi.`,0,socket.id);}));
 socket.on('roll',()=>action(socket,r=>{assertTurn(r,socket.id);if(!['TURN','AWAIT_JAIL'].includes(r.phase))throw Error('Hãy xử lý ô hiện tại trước.');const p=current(r);if(p.jailed){const a=roll(),b=roll();r.lastRoll=[a,b];if(a===b){p.jailed=false;move(r,p,a+b);resolve(r,p);}else{p.jailTurns=(p.jailTurns||0)+1;if(p.jailTurns>=3)r.phase='AWAIT_JAIL';else nextTurn(r);}return;}const a=roll(),b=roll();r.lastRoll=[a,b];move(r,p,a+b);resolve(r,p);if(a===b&&r.phase==='TURN'){p.doubleCount=(p.doubleCount||0)+1;if(p.doubleCount>=3){p.position=10;p.jailed=true;p.doubleCount=0;log(r,`${p.name} đổ đôi 3 lần và vào Tù.`,0,p.id);}}else p.doubleCount=0;}));
 socket.on('buy',()=>action(socket,r=>{assertTurn(r,socket.id);if(r.phase!=='AWAIT_BUY')throw Error('Không có tài sản để mua.');const p=current(r),i=r.pending.cell,c=BOARD[i];if(p.cash<c.price)throw Error('Không đủ tiền mua.');p.cash-=c.price;p.properties.push(i);r.owner[i]=p.id;log(r,`${p.name} mua ${c.name}.`,-c.price,p.id);r.phase='TURN';r.pending=null;}));
 socket.on('skip-buy',()=>action(socket,r=>{assertTurn(r,socket.id);if(r.phase!=='AWAIT_BUY')throw Error('Không có lựa chọn mua.');r.phase='TURN';r.pending=null;}));
 socket.on('pay',()=>action(socket,r=>{assertTurn(r,socket.id);if(!['AWAIT_PAYMENT','AWAIT_JAIL'].includes(r.phase))throw Error('Không có khoản phải trả.');const p=current(r),n=r.phase==='AWAIT_JAIL'?50:r.pending.amount;if(p.cash<n){bankrupt(r,p,'không đủ tiền thanh toán');return;}p.cash-=n;if(r.phase==='AWAIT_JAIL'){p.jailed=false;p.jailTurns=0;}log(r,`${p.name} trả ${n}Đ.`,-n,p.id);r.phase='TURN';r.pending=null;}));
 socket.on('metro',target=>action(socket,r=>{assertTurn(r,socket.id);if(r.phase!=='AWAIT_METRO')throw Error('Metro không khả dụng.');const p=current(r);if(target===null){r.phase='TURN';return;}if(!Number.isInteger(target)||target<0||target>39)throw Error('Ô Metro không hợp lệ.');const fee=Math.floor(p.cash/2);p.cash-=fee;p.position=target;log(r,`${p.name} dùng Metro đến ${BOARD[target].name}.`,-fee,p.id);resolve(r,p);}));
 socket.on('card-action',data=>action(socket,r=>{assertTurn(r,socket.id);if(r.phase!=='AWAIT_CARD_ACTION')throw Error('Không có thẻ cần xử lý.');const p=current(r),t=r.pending.type;if(t==='flight'){const a=roll(),b=roll();r.lastRoll=[a,b];move(r,p,a%2?a:-a,{awardStart:true});move(r,p,b%2?b:-b,{awardStart:true});resolve(r,p);return;}if(t==='highway'){const base=data?.target;if(!Number.isInteger(base)||BOARD[base].kind!=='land')throw Error('Hãy chọn một ô đất.');const d=roll();r.lastRoll=[d];p.position=(base+(d<=3?d*10:0))%40;log(r,`${p.name} mở đường cao tốc.`,0,p.id);resolve(r,p);return;}if(t==='construction'){const avg=r.players.reduce((s,x)=>s+x.properties.filter(i=>BOARD[i].kind==='land').length,0)/r.players.length;const lands=p.properties.filter(i=>BOARD[i].kind==='land');if(lands.length<avg&&lands.length){r.level[lands[0]]=Math.min(5,(r.level[lands[0]]||0)+1);}else if(lands.length>avg){const i=lands.find(i=>(r.level[i]||0)>0);if(i!==undefined)r.level[i]--; }r.phase='TURN';r.pending=null;return;}if(t==='fire'){const total=r.players.reduce((s)=>s+roll()+roll(),0);r.lastRoll=[total];const hit=(p.position+total)%40;if(BOARD[hit].kind==='land'&&(r.level[hit]||0)>0)r.level[hit]--;r.phase='TURN';r.pending=null;return;}if(t==='bom'){r.lastRoll=[roll(),roll()];r.phase='TURN';r.pending=null;return;}throw Error('Thẻ này chưa có thao tác.');}));
 socket.on('build',i=>action(socket,r=>{assertTurn(r,socket.id);if(r.phase!=='TURN')throw Error('Chưa thể xây lúc này.');const p=current(r),c=BOARD[i];if(!ownedBy(r,i,p)||c.kind!=='land'||r.mortgaged[i])throw Error('Không thể xây ở ô này.');const lvl=r.level[i]||0;if(lvl>=5)throw Error('Đã có khách sạn.');if(p.cash<c.build)throw Error('Không đủ tiền xây.');p.cash-=c.build;r.level[i]=lvl+1;log(r,`${p.name} nâng cấp ${c.name}.`,-c.build,p.id);}));
 socket.on('end-turn',()=>action(socket,r=>{assertTurn(r,socket.id);if(r.phase!=='TURN')throw Error('Hãy hoàn tất thao tác bắt buộc.');nextTurn(r);}));
 socket.on('surrender',()=>action(socket,r=>{const p=r.players.find(x=>x.id===socket.id);bankrupt(r,p,'đầu hàng');}));
 socket.on('disconnect',()=>{for(const r of rooms.values()){const p=r.players.find(x=>x.id===socket.id);if(p){p.socketId=null;emit(r);}}});
});
server.listen(PORT,()=>console.log(`Cờ Tỷ Phú chạy tại cổng ${PORT}`));
